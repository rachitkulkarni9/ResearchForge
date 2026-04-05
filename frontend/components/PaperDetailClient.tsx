'use client';

import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { PaperDetail } from '@/types/paper';

interface PaperDetailClientProps {
  paperId: string;
}

export function PaperDetailClient({ paperId }: PaperDetailClientProps) {
  const [detail, setDetail] = useState<PaperDetail | null>(null);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState('');
  const [runOutput, setRunOutput] = useState('');
  const [running, setRunning] = useState(false);

  async function loadDetail() {
    try {
      const data = await apiFetch<PaperDetail>(`/paper/${paperId}`);
      setDetail(data);
      setCode(data.sandbox?.current_code || data.output?.starter_code || 'print("ResearchForge")\n');
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

  async function askQuestion() {
    setAsking(true);
    try {
      const data = await apiFetch<{ answer: string }>('/ask-question', {
        method: 'POST',
        body: JSON.stringify({ paper_id: paperId, question }),
      });
      setAnswer(data.answer);
    } catch (err) {
      setAnswer(err instanceof Error ? err.message : 'Question failed');
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

  return (
    <div className="stack" style={{ marginTop: 24 }}>
      <div className="card stack">
        <div className="button-row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2>{detail.paper.title}</h2>
            <p className="muted">Status: {detail.paper.status}</p>
          </div>
          <button className="button secondary" onClick={() => void loadDetail()} type="button">Refresh</button>
        </div>
        <p>{detail.output?.summary || 'Analysis is still processing. This page will hydrate as the job completes.'}</p>
      </div>

      <div className="tab-grid">
        <div className="stack">
          <div className="card stack">
            <h3>Insights</h3>
            {(detail.output?.key_insights || []).map((item, index) => <div key={index}>- {item}</div>)}
          </div>
          <div className="card stack">
            <h3>Math explanations</h3>
            {(detail.output?.math_explanations || []).map((item, index) => (
              <div key={index}>
                <strong>{item.concept}</strong>
                {item.formula ? <pre className="formula-block">{item.formula}</pre> : null}
                <p className="muted">{item.explanation}</p>
                {item.source_context ? <p className="muted">Recovered from: {item.source_context}</p> : null}
              </div>
            ))}
          </div>
          <div className="card stack">
            <h3>Implementation steps</h3>
            {(detail.output?.implementation_steps || []).map((item, index) => (
              <div key={index}>
                <strong>{item.step}</strong>
                <p className="muted">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          <div className="card stack">
            <h3>Ask the tutor</h3>
            <textarea className="textarea" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="How would I implement the training loop from this paper?" />
            <button className="button" disabled={!question || asking} onClick={askQuestion} type="button">{asking ? 'Thinking...' : 'Ask question'}</button>
            <p className="muted">{answer || 'Answers appear here once the paper has finished processing.'}</p>
          </div>

          <div className="card stack">
            <h3>Sandbox</h3>
            <textarea className="textarea code-editor" value={code} onChange={(e) => setCode(e.target.value)} />
            <div className="button-row">
              <button className="button" disabled={running} onClick={runCode} type="button">{running ? 'Running...' : 'Run code'}</button>
              <button className="button secondary" onClick={resetCode} type="button">Reset</button>
            </div>
            <pre className="console">{runOutput || 'Run the sandbox to see stdout and stderr here.'}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
