'use client';

import Link from 'next/link';
import { ChangeEvent, useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';

import { apiFetch } from '@/lib/api';
import { firebaseAuth } from '@/lib/firebase';
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
  const PAGE_SIZE = 4;
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [latestPaperId, setLatestPaperId] = useState('');
  const [deletingPaperId, setDeletingPaperId] = useState('');
  const [paperPendingDelete, setPaperPendingDelete] = useState<PaperSummary | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [page, setPage] = useState(1);

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

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(papers.length / PAGE_SIZE));
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, papers.length]);

  async function logout() {
    if (firebaseAuth) {
      await signOut(firebaseAuth);
    } else {
      await apiFetch<{ ok: boolean }>('/auth/logout', { method: 'POST' });
    }
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
      setUploadModalOpen(false);
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

  const totalPages = Math.max(1, Math.ceil(papers.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const visiblePapers = papers.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <>
      <section className="app-dashboard-shell">
        <aside className="app-sidebar">
          <div className="app-sidebar-brand">ResearchForge</div>
          <nav className="app-sidebar-nav" aria-label="Dashboard navigation">
            <button className="app-sidebar-link active" type="button">
              <span className="app-sidebar-dot" />
              <span>Dashboard</span>
            </button>
          </nav>
          <div className="app-sidebar-footer">
            <div className="app-sidebar-plan">Workspace</div>
            <strong>{session.workspace.name}</strong>
            <div className="app-sidebar-user">{session.user.name}</div>
            <button className="app-sidebar-logout" onClick={() => void logout()} type="button">Log out</button>
          </div>
        </aside>

        <div className="app-dashboard-main">
          <section className="app-dashboard-panel app-dashboard-panel-left">
            <div className="app-dashboard-hero">
              <div>
                <div className="eyebrow app-dashboard-eyebrow">Dashboard</div>
                <h2>Welcome back, {session.user.name.split(' ')[0] || 'Researcher'}.</h2>
                <p className="app-dashboard-copy">
                  Upload a paper to start building your research workspace.
                </p>
              </div>
            </div>

            <div className="app-quickstart-card">
              <div className="app-section-header">
                <h3>Quick Start</h3>
                <span>Upload your next paper</span>
              </div>
              <button
                className="app-upload-trigger"
                onClick={() => {
                  setError('');
                  setUploadModalOpen(true);
                }}
                type="button"
              >
                <span>Upload Paper</span>
                <span className="app-upload-trigger-arrow">+</span>
              </button>
              <div className="app-feature-note">
                PDFs are fingerprinted per workspace, so duplicate uploads reuse existing results.
              </div>
              {notice ? (
                <div className="stack" style={{ gap: 10 }}>
                  <p className="banner">{notice}</p>
                  {latestPaperId ? <Link className="button ghost" href={`/papers/${latestPaperId}`}>Open paper workspace</Link> : null}
                </div>
              ) : null}
              {error ? <p style={{ color: 'var(--error)' }}>{error}</p> : null}
            </div>
          </section>

          <section className="app-dashboard-panel app-dashboard-panel-right">
            <div className="app-section-header app-library-header">
              <div>
                <div className="eyebrow app-dashboard-eyebrow">Library</div>
                <h3>Workspace papers</h3>
              </div>
              <span>{papers.length} total</span>
            </div>

            <div className="app-paper-library">
              {papers.length === 0 ? (
                <div className="app-empty-state">
                  <h4>No papers yet</h4>
                  <p>Use the upload button to add your first paper and start the pipeline.</p>
                </div>
              ) : null}

              {visiblePapers.map((paper) => (
                <div className="app-paper-card" key={paper.id}>
                  <div className="app-paper-card-main">
                    <Link className="app-paper-card-link" href={`/papers/${paper.id}`}>
                      <strong>{paper.title}</strong>
                      <span>{paper.filename}</span>
                    </Link>
                    <div className="app-paper-card-meta">
                      <span className={`app-status-chip ${paper.status}`}>{paper.status}</span>
                      <button
                        className="app-delete-link"
                        disabled={deletingPaperId === paper.id}
                        onClick={() => setPaperPendingDelete(paper)}
                        type="button"
                      >
                        {deletingPaperId === paper.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {papers.length > PAGE_SIZE ? (
                <div className="app-library-pagination">
                  <span>{pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, papers.length)} of {papers.length}</span>
                  <div className="app-library-pagination-actions">
                    <button
                      className="app-page-button"
                      disabled={page === 1}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      type="button"
                      aria-label="Previous page"
                    >
                      {'<'}
                    </button>
                    <button
                      className="app-page-button"
                      disabled={page === totalPages}
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      type="button"
                      aria-label="Next page"
                    >
                      {'>'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </section>

      {uploadModalOpen ? (
        <div className="upload-modal-backdrop" onClick={() => setUploadModalOpen(false)} role="presentation">
          <div className="upload-modal-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="upload-paper-title">
            <button className="upload-modal-close" onClick={() => setUploadModalOpen(false)} type="button" aria-label="Close upload modal">
              x
            </button>
            <div className="upload-dropzone">
              <div className="upload-dropzone-icon">^</div>
              <h3 id="upload-paper-title">Drag &amp; drop your PDF here</h3>
              <p>PDF files up to 50MB supported</p>
              <label className="upload-browse-button" htmlFor="dashboard-pdf-upload">Browse Files</label>
              <input
                id="dashboard-pdf-upload"
                className="upload-file-input"
                type="file"
                accept="application/pdf"
                onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] || null)}
              />
              {file ? <div className="upload-selected-file">{file.name}</div> : null}
              <button className="button app-upload-confirm" disabled={!file || busy} onClick={() => void uploadPaper()} type="button">
                {busy ? 'Uploading...' : 'Submit PDF'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
    </>
  );
}
