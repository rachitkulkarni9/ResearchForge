'use client';

import Link from 'next/link';
import { BarChart2, FileText, MessageSquare, Terminal } from 'lucide-react';

import { useAppShellSession } from '@/components/AppShellContext';

export default function DashboardPage() {
  const { ready, session } = useAppShellSession();

  if (!ready) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">Loading dashboard...</div>;
  }

  if (!session) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">Sign in to open your dashboard.</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="text-sm font-medium text-violet-700 dark:text-violet-300">Workspace Overview</div>
        <h1 className="mt-2 text-3xl font-semibold text-gray-900 dark:text-gray-100">Welcome back, {session.user.name}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-500 dark:text-gray-400">
          Use ResearchForge to move from paper discovery to implementation, experimentation, and evidence-backed Q&amp;A.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Link href="/papers" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
          <FileText className="h-5 w-5 text-violet-600" />
          <div className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">My Papers</div>
          <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">Manage uploads, statuses, and paper workspaces.</div>
        </Link>
        <Link href="/sandbox" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
          <Terminal className="h-5 w-5 text-violet-600" />
          <div className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Sandbox</div>
          <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">Jump into code execution for an active paper workspace.</div>
        </Link>
        <Link href="/qa" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
          <MessageSquare className="h-5 w-5 text-violet-600" />
          <div className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Q&amp;A</div>
          <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">Ask focused questions against extracted paper context.</div>
        </Link>
        <Link href="/account" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
          <BarChart2 className="h-5 w-5 text-violet-600" />
          <div className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Account</div>
          <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">Review your profile, workspace, and usage context.</div>
        </Link>
      </div>
    </div>
  );
}
