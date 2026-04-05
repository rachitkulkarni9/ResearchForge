'use client';

import { Mail, User } from 'lucide-react';

import { useAppShellSession } from '@/components/AppShellContext';

export default function AccountPage() {
  const { ready, session } = useAppShellSession();

  if (!ready) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">Loading account...</div>;
  }

  if (!session) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">Sign in to access your account.</div>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-100 text-violet-700">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{session.user.name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Workspace owner</p>
          </div>
        </div>
        <div className="mt-6 flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
          <Mail className="h-4 w-4 text-violet-600" />
          {session.user.email}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Workspace</div>
        <div className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">{session.workspace.name}</div>
        <div className="mt-3 inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
          {session.workspace.plan}
        </div>
      </div>
    </div>
  );
}
