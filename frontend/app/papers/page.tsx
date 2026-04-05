'use client';

import { DashboardClient } from '@/components/DashboardClient';
import { useAppShellSession } from '@/components/AppShellContext';

export default function PapersPage() {
  const { ready, session, setSession } = useAppShellSession();

  if (!ready) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">Loading papers...</div>;
  }

  if (!session) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">Sign in to access your papers.</div>;
  }

  return <DashboardClient session={session} onLoggedOut={() => setSession(null)} />;
}
