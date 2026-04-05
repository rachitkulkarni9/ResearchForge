'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { PaperDetail, QAResponse } from '@/types/paper';

const PAPER_VIEWS = [
  { key: 'insights', label: 'Insights', href: 'insights' },
  { key: 'math', label: 'Math', href: 'math' },
  { key: 'implementation', label: 'Implementation', href: 'implementation' },
  { key: 'sandbox', label: 'Sandbox', href: 'sandbox' },
  { key: 'qa', label: 'Q&A', href: 'qa' },
] as const;

type PaperView = 'summary' | (typeof PAPER_VIEWS)[number]['key'];

interface PaperWorkspaceClientProps {
  paperId: string;
  view: PaperView;
}

interface QAThreadMessage {
  role: 'user' | 'assistant';
  text: string;
  response?: QAResponse;
}

function humanizePaperLabel(value: string) {
  return value
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  }));

  const mathAssets = (detail.output?.math_explanations || []).slice(0, 3).map((item, index) => ({
    label: item.concept || `Equation ${index + 1}`,
    detail: item.formula || item.explanation,
  }));

  return [
    { label: 'main_model.py', detail: 'Current editable sandbox file' },
    ...implementationAssets,
    ...mathAssets,
  ].slice(0, 6);
}

export function PaperWorkspaceClient({ paperId, view }: PaperWorkspaceClientProps) {
  const [detail, setDetail] = useState<PaperDetail | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [question, setQuestion] = useState('');
  const [qaMessages, setQaMessages] = useState<QAThreadMessage[]>([]);
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
      const result = await apiFetch<{ message: string }>(`/paper/${paperId}/reprocess`, {
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
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      return;
    }

    setAsking(true);
    setQuestion('');
    setQaMessages((current) => [...current, { role: 'user', text: trimmedQuestion }]);

    try {
      const data = await apiFetch<QAResponse>('/ask-question', {
        method: 'POST',
        body: JSON.stringify({ paper_id: paperId, question: trimmedQuestion }),
      });
      setQaMessages((current) => [
        ...current,
        { role: 'assistant', text: data.answer, response: data },
      ]);
    } catch (err) {
      const fallbackResponse: QAResponse = {
        status: 'insufficient_evidence',
        question_type: 'missing_info',
        answer: err instanceof Error ? err.message : 'Question failed',
        evidence: [],
        confidence: 0,
        citations: [],
      };
      setQaMessages((current) => [
        ...current,
        { role: 'assistant', text: fallbackResponse.answer, response: fallbackResponse },
      ]);
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
  const sandboxAssets = buildSandboxAssets(detail);
  const codeLines = code.split('\n');
  const consoleLines = (runOutput || 'Run the sandbox to see stdout and stderr here.').split('\n');
  const displayTitle = humanizePaperLabel(detail.paper.title || detail.paper.filename);
  const displayFilename = humanizePaperLabel(detail.paper.filename);

  return (
    <section className="app-dashboard-shell paper-workspace-shell">
      <aside className="app-sidebar paper-sidebar">
        <div>
          <div className="app-sidebar-brand">ResearchForge</div>
          <nav className="app-sidebar-nav" aria-label="Paper navigation">
            <Link className={`app-sidebar-link${view === 'summary' ? ' active' : ''}`} href={`/papers/${paperId}`}>
              <span className="app-sidebar-dot" />
              <span>Summary</span>
            </Link>
            {PAPER_VIEWS.map((item) => {
              const href = `/papers/${paperId}/${item.href}`;
              const active = activeHref === item.href;
              return (
                <Link className={`app-sidebar-link${active ? ' active' : ''}`} href={href} key={item.key}>
                  <span className="app-sidebar-dot" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="app-sidebar-footer">
          <div className="app-sidebar-plan">Current paper</div>
          <strong>{displayTitle}</strong>
        </div>
      </aside>

      <div className="app-dashboard-main paper-main-shell">
        <section className="app-dashboard-panel paper-summary-panel">
          <div className="paper-hero-card">
            <div className="button-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="eyebrow paper-meta-eyebrow">{detail.paper.status}</div>
                <h1 className="paper-title">{displayTitle}</h1>
                <p className="paper-filename">{displayFilename}</p>
              </div>
              <div className="button-row" style={{ justifyContent: 'flex-end' }}>
                <Link className="button ghost paper-action-button" href="/">
                  Dashboard
                </Link>
                <button className="button secondary" onClick={() => void loadDetail()} type="button">Refresh</button>
                <button className="button ghost paper-action-button" disabled={reprocessing} onClick={reprocessPaper} type="button">
                  {reprocessing ? 'Reprocessing...' : 'Reprocess'}
                </button>
              </div>
            </div>
            {notice ? <p className="banner">{notice}</p> : null}
            {output?.fallback_mode ? <p className="banner">This paper completed in fallback mode because Gemini was unavailable.</p> : null}
          </div>

          {view === 'summary' ? (
            <div className="paper-content-card">
              <div className="paper-content-header">
                <h3>Abstract Summary</h3>
              </div>
              <p className="paper-summary-text">{output?.summary || 'Summary not available yet.'}</p>
              {(output?.sections || []).length ? (
                <div className="paper-summary-sections">
                  {(output?.sections || []).map((section, index) => (
                    <div key={index} className="paper-summary-section">
                      <strong>{section.title}</strong>
                      <p>{section.summary}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {view === 'insights' ? (
            <div className="paper-grid-content">
              <div className="paper-content-card">
                <h3>Key insights</h3>
                {(output?.key_insights || []).map((item, index) => <div key={index} className="paper-list-line">- {item}</div>)}
              </div>
              <div className="paper-content-card">
                <h3>Novel contributions</h3>
                {(output?.novel_contributions || []).map((item, index) => <div key={index} className="paper-list-line">- {item}</div>)}
              </div>
              <div className="paper-content-card" style={{ gridColumn: '1 / -1' }}>
                <h3>Limitations</h3>
                {(output?.limitations || []).map((item, index) => <div key={index} className="paper-list-line">- {item}</div>)}
              </div>
            </div>
          ) : null}

          {view === 'math' ? (
            <div className="paper-content-card">
              <h3>Mathematical Foundation</h3>
              {(output?.math_explanations || []).map((item, index) => (
                <div key={index} className="paper-detail-block">
                  <strong>{item.concept}</strong>
                  {item.formula ? <pre className="formula-block">{item.formula}</pre> : null}
                  <p>{item.explanation}</p>
                </div>
              ))}
            </div>
          ) : null}

          {view === 'implementation' ? (
            <div className="paper-grid-content">
              <div className="paper-content-card">
                <h3>Implementation steps</h3>
                {(output?.implementation_steps || []).map((item, index) => (
                  <div key={index} className="paper-detail-block">
                    <strong>{item.step}</strong>
                    <p>{item.detail}</p>
                  </div>
                ))}
              </div>
              <div className="paper-content-card">
                <h3>Sandbox tasks</h3>
                {(output?.sandbox_tasks || []).map((item, index) => (
                  <div key={index} className="paper-detail-block">
                    <strong>{item.title}</strong>
                    <p>{item.objective}</p>
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
                  <button className="button ghost paper-action-button" onClick={() => void copyCode()} type="button">{copyLabel}</button>
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
                {qaMessages.length ? (
                  qaMessages.map((message, messageIndex) => {
                    if (message.role === 'user') {
                      return (
                        <div key={messageIndex} className="qa-row qa-row-user">
                          <div className="qa-bubble qa-bubble-user">
                            <p>{message.text}</p>
                          </div>
                          <div className="qa-avatar" aria-hidden="true">Y</div>
                        </div>
                      );
                    }

                    const answerBlocks = parseAnswerBlocks(message.response?.answer || message.text);
                    return (
                      <div key={messageIndex} className="qa-row qa-row-assistant">
                        <div className="qa-avatar" aria-hidden="true">Q</div>
                        <div className="qa-bubble qa-bubble-assistant qa-answer-stack">
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
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="qa-row qa-row-assistant">
                    <div className="qa-avatar" aria-hidden="true">Q</div>
                    <div className="qa-bubble qa-bubble-assistant">
                      <p>Ask anything about the research paper.</p>
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
        </section>
      </div>
    </section>
  );
}
