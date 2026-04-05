'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { PaperDetail, QAResponse } from '@/types/paper';

const PAPER_VIEWS = [
  { key: 'overview', label: 'Overview', href: '' },
  { key: 'summary', label: 'Summary', href: 'summary' },
  { key: 'insights', label: 'Insights', href: 'insights' },
  { key: 'math', label: 'Math', href: 'math' },
  { key: 'implementation', label: 'Implementation', href: 'implementation' },
  { key: 'sandbox', label: 'Sandbox', href: 'sandbox' },
  { key: 'qa', label: 'Q&A', href: 'qa' },
] as const;

type PaperView = (typeof PAPER_VIEWS)[number]['key'];

interface PaperWorkspaceClientProps {
  paperId: string;
  view: PaperView;
}

type AnswerBlock =
  | { type: 'section'; title: string; body: string[] }
  | { type: 'code'; title?: string; code: string };

function parseAnswerBlocks(answer: string): AnswerBlock[] {
  if (!answer.trim()) {
    return [];
  }

  const lines = answer.split('\n');
  const blocks: AnswerBlock[] = [];
  let currentTitle = 'Answer';
  let currentBody: string[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let pendingCodeTitle = '';

  const flushSection = () => {
    const cleaned = currentBody.map((line) => line.trim()).filter(Boolean);
    if (!cleaned.length) {
      return;
    }
    blocks.push({ type: 'section', title: currentTitle, body: cleaned });
    currentBody = [];
  };

  const flushCode = () => {
    if (!codeLines.length) {
      return;
    }
    blocks.push({ type: 'code', title: pendingCodeTitle || undefined, code: codeLines.join('\n').trimEnd() });
    codeLines = [];
    pendingCodeTitle = '';
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        flushSection();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (trimmed.endsWith(':') && trimmed.length < 60) {
      flushSection();
      currentTitle = trimmed.slice(0, -1);
      continue;
    }

    if (trimmed.toUpperCase() === trimmed && trimmed.length > 4 && trimmed.length < 50 && !trimmed.includes(' ')) {
      flushSection();
      currentTitle = trimmed.replace(/_/g, ' ');
      continue;
    }

    if (/implementation|snippet|code/i.test(trimmed) && !trimmed.startsWith('-') && !trimmed.includes(':') && currentBody.length === 0) {
      pendingCodeTitle = trimmed;
      continue;
    }

    currentBody.push(line);
  }

  flushSection();
  flushCode();

  if (!blocks.length) {
    return [{ type: 'section', title: 'Answer', body: answer.split('\n').map((line) => line.trim()).filter(Boolean) }];
  }

  return blocks;
}

function renderInlineFormatting(text: string) {
  const segments = text.split(/(`[^`]+`)/g);
  return segments.map((segment, index) => {
    if (segment.startsWith('`') && segment.endsWith('`')) {
      return <code key={index}>{segment.slice(1, -1)}</code>;
    }
    return segment;
  });
}

function buildSandboxAssets(detail: PaperDetail) {
  const implementationAssets = (detail.output?.implementation_steps || []).slice(0, 4).map((item, index) => ({
    label: item.step || `Implementation ${index + 1}`,
    detail: item.detail,
    kind: 'step',
  }));

  const mathAssets = (detail.output?.math_explanations || []).slice(0, 4).map((item, index) => ({
    label: item.concept || `Equation ${index + 1}`,
    detail: item.formula || item.explanation,
    kind: 'formula',
  }));

  return [
    { label: 'main_model.py', detail: 'Current editable sandbox file', kind: 'file' },
    ...implementationAssets,
    ...mathAssets,
  ].slice(0, 7);
}

export function PaperWorkspaceClient({ paperId, view }: PaperWorkspaceClientProps) {
  const [detail, setDetail] = useState<PaperDetail | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [question, setQuestion] = useState('');
  const [qaResponse, setQaResponse] = useState<QAResponse | null>(null);
  const [asking, setAsking] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [code, setCode] = useState('');
  const [runOutput, setRunOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy code');
  const pathname = usePathname();
  const sandboxEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const sandboxGutterRef = useRef<HTMLDivElement | null>(null);

  async function loadDetail() {
    try {
      const data = await apiFetch<PaperDetail>(`/paper/${paperId}`);
      setDetail(data);
      setCode((current) => current || data.sandbox?.current_code || data.output?.starter_code || 'print("ResearchForge")\n');
      setRunOutput(data.sandbox?.last_run_output?.stdout || '');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load paper');
    }
  }

  useEffect(() => {
    void loadDetail();
    const interval = window.setInterval(() => {
      void loadDetail();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [paperId]);

  async function reprocessPaper() {
    setReprocessing(true);
    setNotice('');
    try {
      const result = await apiFetch<{ message: string }>('/paper/' + paperId + '/reprocess', {
        method: 'POST',
      });
      setNotice(result.message);
      await loadDetail();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Reprocess failed');
    } finally {
      setReprocessing(false);
    }
  }

  async function askQuestion() {
    setAsking(true);
    try {
      const data = await apiFetch<QAResponse>('/ask-question', {
        method: 'POST',
        body: JSON.stringify({ paper_id: paperId, question }),
      });
      setQaResponse(data);
    } catch (err) {
      setQaResponse({
        status: 'insufficient_evidence',
        question_type: 'missing_info',
        answer: err instanceof Error ? err.message : 'Question failed',
        evidence: [],
        confidence: 0,
        citations: [],
      });
    } finally {
      setAsking(false);
    }
  }

  async function runCode() {
    setRunning(true);
    try {
      const data = await apiFetch<{ stdout: string; stderr: string; success: boolean }>('/sandbox/run', {
        method: 'POST',
        body: JSON.stringify({ paper_id: paperId, code }),
      });
      setRunOutput(`${data.stdout}${data.stderr ? `\n${data.stderr}` : ''}`.trim());
    } catch (err) {
      setRunOutput(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setRunning(false);
    }
  }

  async function resetCode() {
    const data = await apiFetch<{ starter_code: string }>('/sandbox/reset', {
      method: 'POST',
      body: JSON.stringify({ paper_id: paperId }),
    });
    setCode(data.starter_code);
    setRunOutput('');
  }

  function syncSandboxScroll() {
    if (!sandboxEditorRef.current || !sandboxGutterRef.current) {
      return;
    }
    sandboxGutterRef.current.scrollTop = sandboxEditorRef.current.scrollTop;
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyLabel('Copied');
      window.setTimeout(() => setCopyLabel('Copy code'), 1800);
    } catch {
      sandboxEditorRef.current?.focus();
      sandboxEditorRef.current?.select();
      setCopyLabel('Select all');
      window.setTimeout(() => setCopyLabel('Copy code'), 1800);
    }
  }

  if (error) {
    return <div className="card"><p style={{ color: 'var(--error)' }}>{error}</p></div>;
  }

  if (!detail) {
    return <div className="card"><p className="muted">Loading paper...</p></div>;
  }

  const output = detail.output;
  const activeHref = pathname.split('/').pop() === paperId ? '' : pathname.split('/').pop();
  const answerBlocks = qaResponse ? parseAnswerBlocks(qaResponse.answer) : [];
  const sandboxAssets = buildSandboxAssets(detail);
  const codeLines = code.split('\n');
  const consoleLines = (runOutput || 'Run the sandbox to see stdout and stderr here.').split('\n');

  return (
    <div className="stack" style={{ marginTop: 24 }}>
      <div className="card stack">
        <div className="button-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="eyebrow">Paper Workspace</div>
            <h2>{detail.paper.title}</h2>
            <p className="muted">{detail.paper.filename}</p>
          </div>
          <div className="stack" style={{ alignItems: 'flex-end', gap: 10 }}>
            <span className="badge">{detail.paper.status}</span>
            <div className="button-row" style={{ justifyContent: 'flex-end' }}>
              <button className="button secondary" onClick={() => void loadDetail()} type="button">Refresh</button>
              <button className="button ghost" disabled={reprocessing} onClick={reprocessPaper} type="button">{reprocessing ? 'Reprocessing...' : 'Reprocess'}</button>
            </div>
          </div>
        </div>
        {notice ? <p className="banner">{notice}</p> : null}
        {output?.fallback_mode ? <p className="banner">This paper completed in fallback mode because Gemini was unavailable. The sandbox and saved outputs still work.</p> : null}
        <div className="paper-nav">
          {PAPER_VIEWS.map((item) => {
            const href = item.href ? `/papers/${paperId}/${item.href}` : `/papers/${paperId}`;
            const active = activeHref === item.href;
            return (
              <Link className={`paper-nav-link${active ? ' active' : ''}`} href={href} key={item.key}>
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      {view === 'overview' ? (
        <div className="grid two">
          <div className="card stack">
            <h3>Summary snapshot</h3>
            <p>{output?.summary || 'Analysis is still processing. Refresh in a few seconds.'}</p>
          </div>
          <div className="card stack">
            <h3>Workspace map</h3>
            <div className="quick-links">
              {PAPER_VIEWS.filter((item) => item.key !== 'overview').map((item) => {
                const href = `/papers/${paperId}/${item.href}`;
                return <Link className="quick-link" href={href} key={item.key}>{item.label}</Link>;
              })}
            </div>
          </div>
          <div className="card stack">
            <h3>Top insights</h3>
            {(output?.key_insights || []).slice(0, 4).map((item, index) => <div key={index}>- {item}</div>)}
          </div>
          <div className="card stack">
            <h3>Sandbox starter</h3>
            <pre className="console">{detail.sandbox?.current_code || output?.starter_code || 'Starter code will appear here.'}</pre>
          </div>
        </div>
      ) : null}

      {view === 'summary' ? (
        <div className="stack">
          <div className="card stack">
            <h3>Paper summary</h3>
            <p>{output?.summary || 'Summary not available yet.'}</p>
          </div>
          <div className="card stack">
            <h3>Sections</h3>
            {(output?.sections || []).map((section, index) => (
              <div key={index} className="section-block">
                <strong>{section.title}</strong>
                <p className="muted">{section.summary}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {view === 'insights' ? (
        <div className="grid two">
          <div className="card stack">
            <h3>Key insights</h3>
            {(output?.key_insights || []).map((item, index) => <div key={index}>- {item}</div>)}
          </div>
          <div className="card stack">
            <h3>Novel contributions</h3>
            {(output?.novel_contributions || []).map((item, index) => <div key={index}>- {item}</div>)}
          </div>
          <div className="card stack" style={{ gridColumn: '1 / -1' }}>
            <h3>Limitations</h3>
            {(output?.limitations || []).map((item, index) => <div key={index}>- {item}</div>)}
          </div>
        </div>
      ) : null}

      {view === 'math' ? (
        <div className="card stack">
          <h3>Math explanations</h3>
          {(output?.math_explanations || []).length === 0 ? <p className="muted">No math explanations were extracted yet.</p> : null}
          {(output?.math_explanations || []).map((item, index) => (
            <div key={index} className="section-block stack" style={{ gap: 10 }}>
              <div className="button-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{item.concept}</strong>
                {item.source_type ? <span className="badge">{item.source_type}</span> : null}
              </div>
              {item.formula ? <pre className="formula-block">{item.formula}</pre> : null}
              {item.variable_notes?.length ? (
                <div className="stack" style={{ gap: 8 }}>
                  <div className="eyebrow">Variables</div>
                  {item.variable_notes.map((note, noteIndex) => <div key={noteIndex}>- {note}</div>)}
                </div>
              ) : null}
              <p className="muted">{item.explanation}</p>
              {item.importance ? <p><strong>Why it matters:</strong> {item.importance}</p> : null}
              {item.source_context ? <p className="muted"><strong>Recovered from:</strong> {item.source_context}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {view === 'implementation' ? (
        <div className="grid two">
          <div className="card stack">
            <h3>Implementation steps</h3>
            {(output?.implementation_steps || []).map((item, index) => (
              <div key={index} className="section-block">
                <strong>{item.step}</strong>
                <p className="muted">{item.detail}</p>
              </div>
            ))}
          </div>
          <div className="card stack">
            <h3>Sandbox tasks</h3>
            {(output?.sandbox_tasks || []).map((item, index) => (
              <div key={index} className="section-block">
                <strong>{item.title}</strong>
                <p className="muted">{item.objective}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {view === 'sandbox' ? (
        <div className="card sandbox-shell">
          <div className="sandbox-topbar">
            <div>
              <div className="eyebrow">Sandbox</div>
              <h3>Research implementation workspace</h3>
            </div>
            <div className="button-row">
              <button className="button" disabled={running} onClick={runCode} type="button">{running ? 'Running...' : 'Run code'}</button>
              <button className="button ghost" onClick={() => void copyCode()} type="button">{copyLabel}</button>
              <button className="button secondary" onClick={resetCode} type="button">Reset</button>
            </div>
          </div>

          <div className="sandbox-layout">
            <aside className="sandbox-sidebar">
              <div className="sandbox-sidebar-title">Extracted assets</div>
              <div className="sandbox-asset-list">
                {sandboxAssets.map((asset, index) => (
                  <div key={`${asset.label}-${index}`} className="sandbox-asset-item">
                    <div className="sandbox-asset-name">{asset.label}</div>
                    <div className="sandbox-asset-detail">{asset.detail}</div>
                  </div>
                ))}
              </div>
            </aside>

            <div className="sandbox-main">
              <div className="sandbox-tabs">
                <div className="sandbox-tab active">main_model.py</div>
              </div>

              <div className="sandbox-editor-shell">
                <div className="sandbox-gutter" aria-hidden="true" ref={sandboxGutterRef}>
                  <div className="sandbox-gutter-inner">
                    {codeLines.map((_, index) => (
                      <div key={index} className="sandbox-line-number">{index + 1}</div>
                    ))}
                  </div>
                </div>
                <textarea
                  className="textarea code-editor sandbox-editor"
                  ref={sandboxEditorRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onScroll={syncSandboxScroll}
                  spellCheck={false}
                  wrap="off"
                />
              </div>

              <div className="sandbox-console-card">
                <div className="sandbox-console-header">
                  <div className="sandbox-console-title">Console output</div>
                  <span className={`sandbox-console-status ${runOutput ? 'ready' : 'idle'}`}>
                    {runOutput ? 'ready' : 'idle'}
                  </span>
                </div>
                <pre className="console sandbox-console-body">
                  {consoleLines.map((line, index) => (
                    <div key={index}>{line || ' '}</div>
                  ))}
                </pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {view === 'qa' ? (
        <div className="card qa-shell">
          <div className="qa-thread">
            <div className="qa-row qa-row-assistant">
              <div className="qa-avatar" aria-hidden="true">✦</div>
              <div className="qa-bubble qa-bubble-assistant">
                <p>
                  I&apos;ve finished indexing the uploaded paper <strong>{detail.paper.title}</strong>. I&apos;m ready to explain the
                  architecture, walk through the math, and turn the formulas into implementation guidance.
                </p>
              </div>
            </div>

            {question ? (
              <div className="qa-row qa-row-user">
                <div className="qa-bubble qa-bubble-user">
                  <p>{question}</p>
                </div>
              </div>
            ) : null}

            {qaResponse ? (
              <div className="qa-row qa-row-assistant">
                <div className="qa-avatar" aria-hidden="true">✦</div>
                <div className="qa-bubble qa-bubble-assistant qa-answer-stack">
                  <div className="qa-meta">
                    <span className="badge">{qaResponse.status}</span>
                    <span className="badge">{qaResponse.question_type}</span>
                    <span className="badge">{(qaResponse.confidence * 100).toFixed(0)}% confidence</span>
                  </div>

                  {answerBlocks.map((block, index) => (
                    block.type === 'section' ? (
                      <div key={index} className="qa-panel">
                        <div className="qa-panel-title">{block.title}</div>
                        <div className="qa-panel-body">
                          {block.body.map((line, lineIndex) => (
                            line.startsWith('-') ? (
                              <div key={lineIndex} className="qa-bullet">{renderInlineFormatting(line.replace(/^-+\s*/, ''))}</div>
                            ) : (
                              <p key={lineIndex}>{renderInlineFormatting(line)}</p>
                            )
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div key={index} className="qa-code-card">
                        {block.title ? <div className="qa-code-title">{block.title}</div> : null}
                        <pre className="console qa-code-block">{block.code}</pre>
                      </div>
                    )
                  ))}

                  {qaResponse.evidence.length ? (
                    <div className="qa-evidence-strip">
                      {qaResponse.evidence.slice(0, 3).map((item, index) => (
                        <div key={index} className="qa-evidence-chip" title={item.passage}>
                          {item.source}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="qa-row qa-row-assistant">
                <div className="qa-avatar" aria-hidden="true">✦</div>
                <div className="qa-bubble qa-bubble-assistant">
                  <p>Ask about formulas, derivations, implementation choices, limitations, or how to turn the paper into code.</p>
                </div>
              </div>
            )}
          </div>

          <div className="qa-composer">
            <textarea
              className="textarea qa-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask anything about the research paper..."
            />
            <button className="button qa-send" disabled={!question || asking} onClick={askQuestion} type="button">
              {asking ? 'Thinking...' : 'Send'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
