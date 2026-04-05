'use client';

import Link from 'next/link';
import { ArrowRight, MessageSquare } from 'lucide-react';

import { useAppShellSession } from '@/components/AppShellContext';

export default function QaHubPage() {
  const { ready, session } = useAppShellSession();

  if (!ready) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">Loading Q&amp;A...</div>;
  }

  if (!session) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">Sign in to access Q&amp;A.</div>;
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <MessageSquare className="h-6 w-6 text-violet-600" />
      <h1 className="mt-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">Q&amp;A</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-500 dark:text-gray-400">
        Open a paper workspace to ask targeted questions backed by the extracted structure, summary, equations, and evidence.
      </p>
      <Link href="/papers" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
        Choose a Paper
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
