'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Copy,
  ExternalLink,
  File,
  FlaskConical,
  Lightbulb,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';

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

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  qaResponse?: QAResponse;
}

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

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown date'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusLabel(status: PaperDetail['paper']['status']) {
  return status === 'pending' ? 'Pending' : status === 'processing' ? 'Processing' : status === 'completed' ? 'Completed' : 'Failed';
}

function statusBadge(status: PaperDetail['paper']['status']) {
  return status === 'completed'
    ? 'bg-emerald-50 text-emerald-700'
    : status === 'failed'
      ? 'bg-red-50 text-red-700'
      : 'bg-amber-50 text-amber-700';
}

function processingText(status: PaperDetail['paper']['status']) {
  return status === 'failed'
    ? 'This analysis did not finish successfully.'
    : status === 'pending'
      ? 'Your paper is queued for analysis.'
      : 'We are extracting structure, math, and implementation details now.';
}

function renderQuestionAnswer(answer: string) {
  return answer.split('\n').filter(Boolean).map((line, index) => (
    <p key={index} className="text-sm leading-7 text-gray-600 dark:text-gray-300">
      {line}
    </p>
  ));
}

function badgeTone(confidence: number) {
  if (confidence > 0.7) {
    return 'bg-emerald-50 text-emerald-700';
  }
  if (confidence > 0.4) {
    return 'bg-amber-50 text-amber-700';
  }
  return 'bg-red-50 text-red-700';
}

function statusTone(status: QAResponse['status']) {
  if (status === 'stated') {
    return 'bg-emerald-50 text-emerald-700';
  }
  if (status === 'inferred') {
    return 'bg-sky-50 text-sky-700';
  }
  if (status === 'hybrid') {
    return 'bg-violet-50 text-violet-700';
  }
  if (status === 'not_stated') {
    return 'bg-gray-100 text-gray-600';
  }
  return 'bg-red-50 text-red-700';
}

async function requestQuestionAnswer(paperId: string, questionText: string) {
  return apiFetch<QAResponse>('/ask-question', {
    method: 'POST',
    body: JSON.stringify({ paper_id: paperId, question: questionText }),
  });
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
  const [outputState, setOutputState] = useState<{ stdout: string; stderr: string; success: boolean } | null>(null);
  const [running, setRunning] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy code');
  const [copiedFormula, setCopiedFormula] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [expandedEvidence, setExpandedEvidence] = useState<Record<number, boolean>>({});
  const pathname = usePathname();
  const sandboxEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const sandboxGutterRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  async function loadDetail() {
    try {
      const data = await apiFetch<PaperDetail>(`/paper/${paperId}`);
      setDetail(data);
      setCode((current) => current || data.sandbox?.current_code || data.output?.starter_code || 'print("ResearchForge")\n');
      setOutputState(data.sandbox?.last_run_output || null);
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
      const result = await apiFetch<{ message: string }>('/paper/' + paperId + '/reprocess', { method: 'POST' });
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

    setMessages((current) => [...current, { role: 'user', content: trimmedQuestion }]);
    setQuestion('');
    setAsking(true);
    try {
      const data = await requestQuestionAnswer(paperId, trimmedQuestion);
      setQaResponse(data);
      setMessages((current) => [...current, { role: 'ai', content: data.answer, qaResponse: data }]);
    } catch (err) {
      const fallback = {
        status: 'insufficient_evidence',
        question_type: 'missing_info',
        answer: err instanceof Error ? err.message : 'Question failed',
        evidence: [],
        confidence: 0,
        citations: [],
      } as QAResponse;
      setQaResponse(fallback);
      setMessages((current) => [...current, { role: 'ai', content: fallback.answer, qaResponse: fallback }]);
    } finally {
      setAsking(false);
    }
  }

  async function submitSuggestedQuestion(questionText: string) {
    if (!questionText.trim() || asking) {
      return;
    }

    setMessages((current) => [...current, { role: 'user', content: questionText }]);
    setQuestion('');
    setAsking(true);
    try {
      const data = await requestQuestionAnswer(paperId, questionText);
      setQaResponse(data);
      setMessages((current) => [...current, { role: 'ai', content: data.answer, qaResponse: data }]);
    } catch (err) {
      const fallback = {
        status: 'insufficient_evidence',
        question_type: 'missing_info',
        answer: err instanceof Error ? err.message : 'Question failed',
        evidence: [],
        confidence: 0,
        citations: [],
      } as QAResponse;
      setQaResponse(fallback);
      setMessages((current) => [...current, { role: 'ai', content: fallback.answer, qaResponse: fallback }]);
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
      setOutputState(data);
    } catch (err) {
      setOutputState({
        stdout: '',
        stderr: err instanceof Error ? err.message : 'Run failed',
        success: false,
      });
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
    setOutputState(null);
  }

  function syncSandboxScroll() {
    if (!sandboxEditorRef.current || !sandboxGutterRef.current) return;
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

  async function copyFormula(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopiedFormula(key);
    window.setTimeout(() => setCopiedFormula(''), 1800);
  }

  const activeHref = pathname.split('/').pop() === paperId ? '' : pathname.split('/').pop();
  const suggestedQuestions = [
    'What problem does this paper solve?',
    'Explain the core methodology',
    'What are the limitations?',
    'How does this compare to prior work?',
    'Can you show the key equations?',
  ];
  const recentQuestions = messages.filter((message) => message.role === 'user').slice(-5).reverse();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, asking]);

  const codeLines = code.split('\n');
  const output = detail?.output ?? null;
  const isProcessing = detail ? !output && detail.paper.status !== 'completed' : false;
  const quickStats = useMemo(
    () => ({
      sections: output?.sections.length ?? 0,
      insights: output?.key_insights.length ?? 0,
      math: output?.math_explanations.length ?? 0,
    }),
    [output],
  );

  if (error) {
    return <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm"><p className="text-sm text-red-600">{error}</p></div>;
  }

  if (!detail) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"><p className="text-sm text-gray-500">Loading paper...</p></div>;
  }

  const renderMissing = () => (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center shadow-sm">
      <div className="text-lg font-semibold text-gray-900">Still processing...</div>
      <p className="mt-2 text-sm text-gray-500">This tab will populate automatically as soon as the paper analysis is ready.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Link href="/papers" className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900">
              <ChevronLeft className="h-4 w-4" />
              My Papers
            </Link>
            <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-gray-100">{detail.paper.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span className="truncate">{detail.paper.filename}</span>
              <span>&middot;</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(detail.paper.status)}`}>
                {statusLabel(detail.paper.status)}
              </span>
              <span>&middot;</span>
              <span>{formatDate(detail.paper.created_at)}</span>
            </div>
          </div>
          {detail.paper.status === 'failed' ? (
            <button
              type="button"
              onClick={() => void reprocessPaper()}
              disabled={reprocessing}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
            >
              <RefreshCw className={`h-4 w-4 ${reprocessing ? 'animate-spin' : ''}`} />
              {reprocessing ? 'Reprocessing...' : 'Reprocess'}
            </button>
          ) : null}
        </div>

        {notice ? <div className="mt-4 rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-700">{notice}</div> : null}
      </section>

      <div className="sticky top-14 z-10 -mx-6 border-b border-gray-200 bg-white/95 px-6 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <nav className="flex flex-wrap gap-6">
          {PAPER_VIEWS.map((item) => {
            const href = item.href ? `/papers/${paperId}/${item.href}` : `/papers/${paperId}`;
            const active = activeHref === item.href;
            return (
              <Link
                key={item.key}
                href={href}
                className={`border-b-2 py-4 text-sm ${
                  active ? 'border-violet-600 font-medium text-violet-700 dark:text-violet-300' : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {isProcessing ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mx-auto flex max-w-lg flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-gray-900 dark:text-gray-100">Analyzing your paper...</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{processingText(detail.paper.status)}</p>
            <p className="mt-1 text-sm text-gray-400">This usually takes 30–60 seconds</p>
          </div>
        </div>
      ) : null}

      {!isProcessing && view === 'overview' ? (
        output ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_360px]">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Paper Summary</div>
              <p className="mt-4 text-sm leading-7 text-gray-600 dark:text-gray-300">{output.summary}</p>
            </div>
            <div className="space-y-6">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Quick Stats</div>
                <div className="mt-5 grid gap-4">
                  <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-950"><span className="text-sm text-gray-500">Sections</span><span className="text-lg font-semibold">{quickStats.sections}</span></div>
                  <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-950"><span className="text-sm text-gray-500">Insights</span><span className="text-lg font-semibold">{quickStats.insights}</span></div>
                  <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-950"><span className="text-sm text-gray-500">Math Explanations</span><span className="text-lg font-semibold">{quickStats.math}</span></div>
                </div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Jump to Section</div>
                <div className="mt-4 grid gap-2">
                  {PAPER_VIEWS.filter((item) => item.key !== 'overview').map((item) => (
                    <Link key={item.key} href={item.href ? `/papers/${paperId}/${item.href}` : `/papers/${paperId}`} className="inline-flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-600 hover:border-violet-200 hover:text-violet-700 dark:border-gray-800 dark:text-gray-300">
                      {item.label}
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : renderMissing()
      ) : null}

      {!isProcessing && view === 'summary' ? (
        output ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
              <div className="rounded-r-xl border-l-4 border-violet-500 pl-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">TL;DR</div>
                <p className="mt-2 text-sm leading-7 text-violet-900">{output.summary}</p>
              </div>
            </div>
            <div className="space-y-4">
              {output.sections.map((section, index) => {
                const expanded = expandedSections[section.title] ?? index === 0;
                return (
                  <div key={section.title} className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <button type="button" onClick={() => setExpandedSections((c) => ({ ...c, [section.title]: !expanded }))} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
                      <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{section.title}</div>
                      <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                    {expanded ? <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-800"><p className="text-sm leading-7 text-gray-600 dark:text-gray-300">{section.summary}</p></div> : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : renderMissing()
      ) : null}

      {!isProcessing && view === 'insights' ? (
        output ? (
          <div className="grid gap-6 xl:grid-cols-3">
            <div className="space-y-4">
              <div className="flex items-center gap-3"><Lightbulb className="h-5 w-5 text-violet-500" /><h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Key Insights</h2></div>
              {output.key_insights.map((item, index) => <div key={index} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"><div className="flex gap-3"><Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-500" /><p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{item}</p></div></div>)}
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-emerald-500" /><h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Novel Contributions</h2></div>
              {output.novel_contributions.map((item, index) => <div key={index} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"><div className="flex gap-3"><Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" /><p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{item}</p></div></div>)}
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-amber-500" /><h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Limitations</h2></div>
              {output.limitations.map((item, index) => <div key={index} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" /><p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{item}</p></div></div>)}
            </div>
          </div>
        ) : renderMissing()
      ) : null}

      {!isProcessing && view === 'math' ? (
        output ? (
          <div className="space-y-5">
            {output.math_explanations.length === 0 ? renderMissing() : null}
            {output.math_explanations.map((item, index) => (
              <div key={`${item.concept}-${index}`} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{item.concept}</h2>
                  <span className="w-fit rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">{item.importance}</span>
                </div>
                <div className="mt-5 rounded-lg bg-gray-950 p-4 text-sm text-green-400">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.18em] text-gray-400">Formula</span>
                    <button type="button" onClick={() => void copyFormula(item.formula, item.concept)} className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800"><Copy className="h-3.5 w-3.5" />{copiedFormula === item.concept ? 'Copied' : 'Copy'}</button>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap font-mono">{item.formula}</pre>
                </div>
                {item.variable_notes.length ? <ul className="mt-5 space-y-2">{item.variable_notes.map((note, noteIndex) => <li key={noteIndex} className="text-xs leading-5 text-gray-500 dark:text-gray-400">{note}</li>)}</ul> : null}
                <p className="mt-5 text-sm leading-7 text-gray-600 dark:text-gray-300">{item.explanation}</p>
              </div>
            ))}
          </div>
        ) : renderMissing()
      ) : null}

      {!isProcessing && view === 'implementation' ? (
        output ? (
          <div className="space-y-6">
            <div className="space-y-4">
              {output.implementation_steps.map((item, index) => (
                <div key={`${item.step}-${index}`} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex gap-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">{index + 1}</div>
                    <div><h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{item.step}</h2><p className="mt-2 text-sm leading-7 text-gray-600 dark:text-gray-300">{item.detail}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : renderMissing()
      ) : null}

      {!isProcessing && view === 'sandbox' ? (
        <div className="-mx-6 -mb-6 bg-gray-950">
          <div className="flex h-12 items-center gap-3 border-b border-gray-700 bg-gray-900 px-4">
            <div className="flex min-w-0 items-center gap-2">
              <Terminal className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-medium text-white">Sandbox</span>
              <span className="text-sm text-gray-500">&middot;</span>
              <span className="truncate text-sm text-gray-400">{detail.paper.title}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => void resetCode()}
                className="inline-flex items-center gap-1.5 rounded-md bg-gray-700 px-3 py-1.5 text-xs text-gray-200 transition-colors hover:bg-gray-600"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
              <button
                type="button"
                onClick={() => void runCode()}
                disabled={running}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Run
              </button>
            </div>
          </div>

          <div className="flex h-[calc(100vh-7rem)]">
            <aside className="w-48 border-r border-gray-800 bg-gray-950">
              <div className="px-3 py-2 text-xs uppercase tracking-wider text-gray-500">Files</div>
              <div className="space-y-0.5 px-2">
                <div className="flex w-full items-center gap-2 rounded-md bg-gray-800 px-3 py-1.5 text-left text-sm text-white">
                  <File className="h-4 w-4" />
                  main.py
                </div>
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col bg-gray-950">
              <div className="relative flex-1 overflow-hidden">
                <div
                  ref={sandboxGutterRef}
                  className="pointer-events-none absolute left-0 top-0 z-10 h-full w-8 overflow-hidden border-r border-gray-900 bg-gray-950/95 py-4 text-right text-xs text-gray-600"
                  aria-hidden="true"
                >
                  {codeLines.map((_, index) => (
                    <div key={index} className="h-5 pr-2">
                      {index + 1}
                    </div>
                  ))}
                </div>
                <textarea
                  ref={sandboxEditorRef}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  onScroll={syncSandboxScroll}
                  spellCheck={false}
                  wrap="off"
                  className="h-full w-full resize-none bg-gray-950 p-4 pl-12 font-mono text-sm text-gray-100 outline-none"
                />
              </div>

              <div className="h-44 border-t border-gray-800 bg-gray-950">
                <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
                  <div className="flex items-center gap-4">
                    <button type="button" className="text-xs text-white">
                      Output
                    </button>
                    <button type="button" className="text-xs text-gray-400">
                      Console
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOutputState(null)}
                    className="text-gray-500 transition-colors hover:text-gray-300"
                    aria-label="Clear output"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="h-[132px] overflow-auto p-3 font-mono text-xs">
                  {running ? (
                    <div className="flex items-center gap-2 text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Running sandbox...</span>
                    </div>
                  ) : outputState ? (
                    <div className="space-y-1">
                      {outputState.stdout
                        .split('\n')
                        .filter(Boolean)
                        .map((line, index) => (
                          <div key={`stdout-${index}`} className="text-gray-300">
                            {line}
                          </div>
                        ))}
                      {outputState.stderr
                        .split('\n')
                        .filter(Boolean)
                        .map((line, index) => (
                          <div key={`stderr-${index}`} className="text-red-400">
                            {line}
                          </div>
                        ))}
                      <div className={outputState.success ? 'text-emerald-400' : 'text-red-400'}>
                        {outputState.success ? '✓ Execution successful' : '✗ Execution failed'}
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-500">Run the sandbox to see stdout and stderr here.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!isProcessing && view === 'qa' ? (
        output ? (
          <div className="flex min-h-[calc(100vh-13rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#202123]">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="border-b border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#202123]">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-violet-600" />
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Q&amp;A Assistant</span>
                  </div>
                  <span className="max-w-full truncate rounded-full bg-violet-50 px-2.5 py-0.5 text-xs text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                    {detail.paper.title}
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                  {messages.length === 0 ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-950/40">
                        <FlaskConical className="h-5 w-5 text-violet-600 dark:text-violet-300" />
                      </div>
                      <h2 className="mt-6 text-2xl font-semibold text-gray-900 dark:text-gray-100">How can I help with this paper?</h2>
                      <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-500 dark:text-gray-400">
                        Ask about formulas, derivations, implementation details, assumptions, comparisons to prior work, or anything else in the paper.
                      </p>
                      <div className="mt-8 flex w-full flex-wrap justify-center gap-3">
                        {suggestedQuestions.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => void submitSuggestedQuestion(item)}
                            className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 dark:border-gray-700 dark:bg-[#2a2b32] dark:text-gray-200 dark:hover:border-violet-800 dark:hover:bg-[#343541] dark:hover:text-violet-300"
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {messages.map((message, messageIndex) =>
                    message.role === 'user' ? (
                      <div key={messageIndex} className="flex justify-end">
                        <div className="max-w-2xl rounded-3xl rounded-br-md bg-[#f4f4f4] px-5 py-3 text-sm leading-7 text-gray-900 dark:bg-[#2f2f2f] dark:text-gray-100">
                          {message.content}
                        </div>
                      </div>
                    ) : (
                      <div key={messageIndex} className="flex gap-4">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-950/40">
                          <FlaskConical className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                        </div>
                        <div className="max-w-2xl flex-1 rounded-3xl rounded-bl-md border border-gray-200 bg-white px-5 py-4 shadow-sm dark:border-gray-700 dark:bg-[#2a2b32]">
                          <div className="space-y-4">
                            {message.qaResponse
                              ? parseAnswerBlocks(message.content).map((block, blockIndex) =>
                                  block.type === 'section' ? (
                                    <div key={blockIndex}>
                                      <div className="mb-2 text-sm font-medium text-gray-900 dark:text-gray-100">{block.title}</div>
                                      {block.body.map((line, lineIndex) => (
                                        <p key={lineIndex} className="mb-2 text-sm leading-7 text-gray-700 dark:text-gray-300">
                                          {line}
                                        </p>
                                      ))}
                                    </div>
                                  ) : (
                                    <pre key={blockIndex} className="overflow-x-auto rounded-2xl bg-gray-950 p-4 font-mono text-xs text-green-400">
                                      {block.code}
                                    </pre>
                                  ),
                                )
                              : renderQuestionAnswer(message.content)}
                          </div>

                          {message.qaResponse ? (
                            <>
                              <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-400">
                                <span className={`rounded-full px-2 py-0.5 ${badgeTone(message.qaResponse.confidence)}`}>
                                  Confidence: {Math.round(message.qaResponse.confidence * 100)}%
                                </span>
                                <span className={`rounded-full px-2 py-0.5 ${statusTone(message.qaResponse.status)}`}>
                                  {message.qaResponse.status}
                                </span>
                                {message.qaResponse.citations.length > 0 ? <span>{message.qaResponse.citations.length} citations</span> : null}
                              </div>

                              {message.qaResponse.evidence.length > 0 ? (
                                <div className="mt-3">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedEvidence((current) => ({ ...current, [messageIndex]: !current[messageIndex] }))}
                                    className="text-xs font-medium text-violet-700 dark:text-violet-300"
                                  >
                                    {expandedEvidence[messageIndex] ? 'Hide Evidence' : 'View Evidence'}
                                  </button>
                                  {expandedEvidence[messageIndex] ? (
                                    <div className="mt-3 space-y-2">
                                      {message.qaResponse.evidence.map((item, evidenceIndex) => (
                                        <div key={evidenceIndex} className="rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-[#202123]">
                                          <div className="text-xs font-medium text-gray-700 dark:text-gray-300">{item.source}</div>
                                          <div className="mt-1 text-xs italic text-gray-500 dark:text-gray-400">{item.passage}</div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </div>
                    ),
                  )}

                  {asking ? (
                    <div className="flex gap-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-950/40">
                        <FlaskConical className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                      </div>
                      <div className="max-w-2xl rounded-3xl rounded-bl-md border border-gray-200 bg-white px-5 py-4 shadow-sm dark:border-gray-700 dark:bg-[#2a2b32]">
                        <div className="flex gap-1">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.3s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.15s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400" />
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <div className="border-t border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-[#202123] sm:px-6">
                {messages.length > 0 ? (
                  <div className="mx-auto mb-3 flex w-full max-w-3xl gap-2 overflow-x-auto pb-1">
                    {suggestedQuestions.slice(0, 5).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => void submitSuggestedQuestion(item)}
                        className="whitespace-nowrap rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-violet-200 hover:text-violet-700 dark:border-gray-700 dark:bg-[#2a2b32] dark:text-gray-300"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                ) : null}

                {!output.qa_ready ? (
                  <div className="mx-auto max-w-3xl rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500 dark:border-gray-800 dark:bg-[#2a2b32] dark:text-gray-400">
                    Still processing...
                  </div>
                ) : (
                  <div className="mx-auto w-full max-w-3xl">
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <textarea
                          value={question}
                          onChange={(event) => setQuestion(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault();
                              void askQuestion();
                            }
                          }}
                          placeholder="Message ResearchForge"
                          rows={1}
                          className="max-h-32 min-h-[56px] w-full resize-none rounded-3xl border border-gray-200 bg-white px-5 py-4 text-sm outline-none transition-all focus:border-violet-400 focus:ring-2 focus:ring-violet-500 dark:border-gray-700 dark:bg-[#2a2b32] dark:text-gray-100"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void askQuestion()}
                        disabled={!question.trim() || asking}
                        className="rounded-2xl bg-violet-600 p-3 text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label="Send question"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 px-2 text-xs text-gray-400">Enter to send</div>
                  </div>
                )}
              </div>
            </div>

            <aside className="hidden w-72 border-l border-gray-200 bg-white p-4 lg:block dark:border-gray-800 dark:bg-[#171717]">
              <div className="space-y-4">
                <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Paper Info</div>
                  <div className="mt-3 text-sm font-medium text-gray-900 dark:text-gray-100">{detail.paper.title}</div>
                  <div className="mt-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(detail.paper.status)}`}>
                      {statusLabel(detail.paper.status)}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{detail.paper.filename}</div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Answer Quality Guide</div>
                  <div className="mt-3 space-y-3 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" />Directly stated in paper</div>
                    <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sky-500" />Inferred from context</div>
                    <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-violet-500" />Partial evidence</div>
                    <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-gray-400" />Not found in paper</div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Recent Questions</div>
                  <div className="mt-3 space-y-2">
                    {recentQuestions.length > 0 ? (
                      recentQuestions.map((item, index) => (
                        <button
                          key={`${item.content}-${index}`}
                          type="button"
                          onClick={() => setQuestion(item.content)}
                          className="block w-full rounded-lg bg-gray-50 px-3 py-2 text-left text-xs text-gray-600 transition-colors hover:text-violet-700 dark:bg-gray-950 dark:text-gray-300"
                        >
                          {item.content}
                        </button>
                      ))
                    ) : (
                      <div className="text-xs text-gray-400">Your recent questions will appear here.</div>
                    )}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        ) : renderMissing()
      ) : null}
    </div>
  );
}
