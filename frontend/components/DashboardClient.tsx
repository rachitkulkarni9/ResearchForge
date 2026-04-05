'use client';

import Link from 'next/link';
import { ChangeEvent, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { PaperSummary } from '@/types/paper';

interface UploadPaperResult {
  paper: PaperSummary;
  job: { id: string; status: string };
  already_exists: boolean;
  message?: string | null;
}

interface DashboardClientProps {
  session: {
    user: { name: string; email: string };
    workspace: { name: string };
  };
  onLoggedOut: () => void;
}

export function DashboardClient({ session, onLoggedOut }: DashboardClientProps) {
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [latestPaperId, setLatestPaperId] = useState('');
  const [deletingPaperId, setDeletingPaperId] = useState('');
  const [paperPendingDelete, setPaperPendingDelete] = useState<PaperSummary | null>(null);

  async function loadPapers() {
    try {
      const data = await apiFetch<PaperSummary[]>('/papers');
      setPapers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load papers');
    }
  }

  useEffect(() => {
    void loadPapers();
  }, []);

  async function logout() {
    await apiFetch<{ ok: boolean }>('/auth/logout', { method: 'POST' });
    onLoggedOut();
  }

  async function uploadPaper() {
    if (!file) return;
    setBusy(true);
    setError('');
    setNotice('');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const result = await apiFetch<UploadPaperResult>('/upload-paper', {
        method: 'POST',
        body: formData,
      });
      setFile(null);
      setNotice(result.message || (result.already_exists ? 'You already uploaded this paper.' : 'Paper uploaded successfully.'));
      setLatestPaperId(result.paper.id);
      await loadPapers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function deletePaper() {
    if (!paperPendingDelete) {
      return;
    }

    setDeletingPaperId(paperPendingDelete.id);
    setError('');
    setNotice('');
    try {
      const result = await apiFetch<{ message: string }>(`/paper/${paperPendingDelete.id}`, {
        method: 'DELETE',
      });
      if (latestPaperId === paperPendingDelete.id) {
        setLatestPaperId('');
      }
      setNotice(result.message);
      setPaperPendingDelete(null);
      await loadPapers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingPaperId('');
    }
  }

  return (
    <div className="grid two" style={{ marginTop: 24 }}>
      <div className="card stack">
        <div>
          <div className="button-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="eyebrow">Dashboard</div>
              <h2>Upload a paper</h2>
              <p className="muted">Signed in as {session.user.name} in {session.workspace.name}.</p>
            </div>
            <button className="button ghost" onClick={() => void logout()} type="button">Log out</button>
          </div>
          <p className="muted">PDFs are fingerprinted per workspace. If the same paper is uploaded again, ResearchForge reuses the existing record and results instead of reprocessing it.</p>
        </div>
        <input className="input" type="file" accept="application/pdf" onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] || null)} />
        <div className="button-row">
          <button className="button" disabled={!file || busy} onClick={uploadPaper} type="button">{busy ? 'Uploading...' : 'Upload PDF'}</button>
          <button className="button secondary" onClick={() => void loadPapers()} type="button">Refresh</button>
        </div>
        {notice ? (
          <div className="stack" style={{ gap: 10 }}>
            <p className="banner">{notice}</p>
            {latestPaperId ? <Link className="button ghost" href={`/papers/${latestPaperId}`}>Open paper workspace</Link> : null}
          </div>
        ) : null}
        {error ? <p style={{ color: 'var(--error)' }}>{error}</p> : null}
      </div>

      <div className="card stack">
        <div>
          <div className="eyebrow">Library</div>
          <h2>Workspace papers</h2>
          <p className="muted">Open a paper to jump into its dedicated workspace and browse each generated view as its own page.</p>
        </div>
        <div className="paper-list">
          {papers.length === 0 ? <p className="muted">No papers yet. Upload one to start the pipeline.</p> : null}
          {papers.map((paper) => (
            <div className="paper-row" key={paper.id}>
              <Link href={`/papers/${paper.id}`}>
                <div>
                  <strong>{paper.title}</strong>
                  <div className="muted">{paper.filename}</div>
                </div>
              </Link>
              <div className="button-row" style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                <span className="badge">{paper.status}</span>
                <button className="button ghost" disabled={deletingPaperId === paper.id} onClick={() => setPaperPendingDelete(paper)} type="button">
                  {deletingPaperId === paper.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {paperPendingDelete ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="delete-paper-title">
            <div className="eyebrow">Delete Paper</div>
            <h3 id="delete-paper-title">Remove this paper from ResearchForge?</h3>
            <p className="muted">
              <strong>{paperPendingDelete.title}</strong> will be deleted along with its uploaded PDF, processed outputs,
              and sandbox session. This action cannot be undone.
            </p>
            <div className="button-row" style={{ justifyContent: 'flex-end' }}>
              <button className="button secondary" onClick={() => setPaperPendingDelete(null)} type="button">
                Cancel
              </button>
              <button className="button" disabled={deletingPaperId === paperPendingDelete.id} onClick={() => void deletePaper()} type="button">
                {deletingPaperId === paperPendingDelete.id ? 'Deleting...' : 'Delete paper'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
