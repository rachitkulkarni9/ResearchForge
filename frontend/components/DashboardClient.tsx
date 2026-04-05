'use client';

import Link from 'next/link';
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

import type { AppShellSession } from '@/components/AppShellContext';
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
  session: AppShellSession;
  onLoggedOut: () => void;
}

type FilterTab = 'All' | 'Processing' | 'Completed' | 'Failed';

const filterTabs: FilterTab[] = ['All', 'Processing', 'Completed', 'Failed'];

function formatRelativeTime(isoDate: string) {
  const timestamp = new Date(isoDate).getTime();
  if (Number.isNaN(timestamp)) {
    return 'Updated recently';
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 60) {
    return `Updated ${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Updated ${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return `Updated ${diffDays}d ago`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `Updated ${diffMonths}mo ago`;
  }

  const diffYears = Math.floor(diffMonths / 12);
  return `Updated ${diffYears}y ago`;
}

function getTabMatch(status: PaperSummary['status'], tab: FilterTab) {
  if (tab === 'All') {
    return true;
  }

  if (tab === 'Processing') {
    return status === 'pending' || status === 'processing';
  }

  if (tab === 'Completed') {
    return status === 'completed';
  }

  return status === 'failed';
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
  const [activeTab, setActiveTab] = useState<FilterTab>('All');
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function loadPapers() {
    try {
      setLoading(true);
      const data = await apiFetch<PaperSummary[]>('/papers');
      setPapers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load papers');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPapers();
  }, []);

  useEffect(() => {
    if (!notice && !error) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setNotice('');
      setError('');
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [notice, error]);

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
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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

  const filteredPapers = useMemo(
    () => papers.filter((paper) => getTabMatch(paper.status, activeTab)),
    [activeTab, papers],
  );

  const totalPapers = papers.length;
  const processingCount = papers.filter((paper) => paper.status === 'pending' || paper.status === 'processing').length;
  const completedCount = papers.filter((paper) => paper.status === 'completed').length;

  return (
    <>
      <section id="papers" className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">My Papers</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage and explore your uploaded research for {session.workspace.name}.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] || null)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 ease-in-out hover:bg-violet-700"
              >
                <Plus className="h-4 w-4" />
                Upload Paper
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-all duration-200 ease-in-out hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Log out
              </button>
            </div>

            {file ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex max-w-full items-center rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                  <span className="max-w-[220px] truncate">{file.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void uploadPaper()}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-4 py-2 text-sm font-medium text-violet-700 transition-all duration-200 ease-in-out hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-900 dark:bg-gray-900 dark:text-violet-300"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {busy ? 'Analyzing...' : 'Analyze Paper'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                  aria-label="Clear selected file"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                <FileText className="h-5 w-5" />
              </div>
              <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{totalPapers}</div>
            </div>
            <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">Total Papers</div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                <Clock3 className="h-5 w-5" />
              </div>
              <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{processingCount}</div>
            </div>
            <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">Processing</div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{completedCount}</div>
            </div>
            <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">Completed</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5 border-b border-gray-200 dark:border-gray-800">
          {filterTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'border-violet-600 text-violet-700 dark:text-violet-300'
                  : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="animate-pulse space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="h-5 w-5 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-5 w-20 rounded-full bg-gray-200 dark:bg-gray-700" />
                  </div>
                  <div className="h-5 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="space-y-2">
                    <div className="h-4 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-4 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="flex gap-2">
                      <div className="h-9 w-9 rounded-lg bg-gray-200 dark:bg-gray-700" />
                      <div className="h-9 w-9 rounded-lg bg-gray-200 dark:bg-gray-700" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredPapers.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mx-auto flex max-w-md flex-col items-center text-center">
              <div className="flex h-[220px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-500">
                <Upload className="h-8 w-8" />
                <div className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">No papers yet</div>
                <div className="mt-2 text-sm">Upload your first paper to start analysis and workspace generation.</div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-5 flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 ease-in-out hover:bg-violet-700"
                >
                  <Plus className="h-4 w-4" />
                  Upload Paper
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredPapers.map((paper) => {
              const isProcessing = paper.status === 'pending' || paper.status === 'processing';
              const isCompleted = paper.status === 'completed';
              const isFailed = paper.status === 'failed';

              return (
                <article
                  key={paper.id}
                  className="rounded-xl border border-gray-200 bg-white p-5 transition-all duration-200 ease-in-out hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <FileText className="h-5 w-5 text-violet-400" />

                    {isCompleted ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                        Completed
                      </span>
                    ) : null}

                    {isProcessing ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {paper.status === 'pending' ? 'Pending' : 'Processing'}
                      </span>
                    ) : null}

                    {isFailed ? (
                      <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
                        Failed
                      </span>
                    ) : null}
                  </div>

                  <h3 className="mt-2 line-clamp-2 font-semibold text-gray-900 dark:text-gray-100">{paper.title}</h3>
                  <p className="mt-1 truncate text-xs text-gray-400">{paper.filename}</p>

                  <div className="mt-6 flex items-center justify-between">
                    <span className="text-xs text-gray-400">{formatRelativeTime(paper.created_at)}</span>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/papers/${paper.id}`}
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-violet-600 dark:hover:bg-gray-800"
                        aria-label={`Open ${paper.title}`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setPaperPendingDelete(paper)}
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-800"
                        aria-label={`Delete ${paper.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {paperPendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-paper-title"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h3 id="delete-paper-title" className="mt-4 break-words text-lg font-semibold leading-8 text-gray-900 dark:text-gray-100">
              Delete "{paperPendingDelete.title}"?
            </h3>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              This removes the uploaded PDF, generated outputs, and sandbox session for this paper. This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPaperPendingDelete(null)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-all duration-200 ease-in-out hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deletePaper()}
                disabled={deletingPaperId === paperPendingDelete.id}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 ease-in-out hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingPaperId === paperPendingDelete.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-lg dark:border-emerald-900 dark:bg-gray-900">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
            <div className="text-sm text-emerald-700 dark:text-emerald-300">
              <div>{notice}</div>
              {latestPaperId ? (
                <Link href={`/papers/${latestPaperId}`} className="mt-1 inline-flex text-xs font-medium text-violet-700 hover:text-violet-800 dark:text-violet-300">
                  Open paper workspace
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-red-200 bg-white px-4 py-3 shadow-lg dark:border-red-900 dark:bg-gray-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-red-600" />
            <div className="text-sm text-red-600">{error}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
