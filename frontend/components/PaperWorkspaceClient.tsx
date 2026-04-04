'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

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
  const pathname = usePathname();

  async function loadDetail() {
    try {
      const data = await apiFetch<PaperDetail>(`/paper/${paperId}`);
      setDetail(data);
      setCode((current) => current || data.sandbox?.current_code || data.output?.starter_code || 'print("PaperLab")\n');
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

  if (error) {
    return <div className="card"><p style={{ color: 'var(--error)' }}>{error}</p></div>;
  }

  if (!detail) {
    return <div className="card"><p className="muted">Loading paper...</p></div>;
  }

  const output = detail.output;
  const activeHref = pathname.split('/').pop() === paperId ? '' : pathname.split('/').pop();

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
              <strong>{item.concept}</strong>
              {item.formula ? <pre className="formula-block">{item.formula}</pre> : null}
              {item.variable_notes?.length ? (
                <div className="stack" style={{ gap: 8 }}>
                  <div className="eyebrow">Variables</div>
                  {item.variable_notes.map((note, noteIndex) => <div key={noteIndex}>- {note}</div>)}
                </div>
              ) : null}
              <p className="muted">{item.explanation}</p>
              {item.importance ? <p><strong>Why it matters:</strong> {item.importance}</p> : null}
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
        <div className="grid two">
          <div className="card stack">
            <h3>Editor</h3>
            <textarea className="textarea code-editor" value={code} onChange={(e) => setCode(e.target.value)} />
            <div className="button-row">
              <button className="button" disabled={running} onClick={runCode} type="button">{running ? 'Running...' : 'Run code'}</button>
              <button className="button secondary" onClick={resetCode} type="button">Reset</button>
            </div>
          </div>
          <div className="card stack">
            <h3>Output</h3>
            <pre className="console">{runOutput || 'Run the sandbox to see stdout and stderr here.'}</pre>
          </div>
        </div>
      ) : null}

      {view === 'qa' ? (
        <div className="card stack">
          <h3>Ask the tutor</h3>
          <textarea className="textarea" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What evidence supports the architecture choice, and what limitations are stated?" />
          <div className="button-row">
            <button className="button" disabled={!question || asking} onClick={askQuestion} type="button">{asking ? 'Thinking...' : 'Ask question'}</button>
          </div>
          {qaResponse ? (
            <div className="stack">
              <div className="grid two">
                <div className="card stack">
                  <div className="eyebrow">Status</div>
                  <strong>{qaResponse.status}</strong>
                </div>
                <div className="card stack">
                  <div className="eyebrow">Question type</div>
                  <strong>{qaResponse.question_type}</strong>
                </div>
              </div>
              <div className="card stack">
                <div className="eyebrow">Answer</div>
                <p>{qaResponse.answer}</p>
                <p className="muted">Confidence: {(qaResponse.confidence * 100).toFixed(0)}%</p>
              </div>
              <div className="card stack">
                <div className="eyebrow">Evidence</div>
                {qaResponse.evidence.map((item, index) => (
                  <div key={index} className="section-block stack" style={{ gap: 8 }}>
                    <strong>{item.source}</strong>
                    <pre className="console" style={{ background: '#2b241e' }}>{item.passage}</pre>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <pre className="console">Ask a question about architecture, limitations, evaluation, future work, or failure cases.</pre>
          )}
        </div>
      ) : null}
    </div>
  );
}
