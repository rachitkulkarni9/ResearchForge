'use client';

import { useEffect, useState } from 'react';

import { AuthPanel } from '@/components/AuthPanel';
import { DashboardClient } from '@/components/DashboardClient';
import { apiFetch } from '@/lib/api';

interface SessionUser {
  id: string;
  email: string;
  name: string;
  default_workspace_id: string;
}

interface SessionWorkspace {
  id: string;
  name: string;
  owner_user_id: string;
  plan: string;
}

interface SessionResponse {
  authenticated: boolean;
  token_type: 'session';
  user: SessionUser;
  workspace: SessionWorkspace;
}

export default function HomePage() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function loadSession() {
      try {
        const data = await apiFetch<SessionResponse>('/auth/session');
        setSession(data);
      } catch {
        setSession(null);
      } finally {
        setReady(true);
      }
    }

    void loadSession();
  }, []);

  return (
    <main className="shell stack">
      <section className="hero">
        <h1>ResearchForge turns research papers into working sandboxes.</h1>
        <p>
          Upload a formula-heavy ML paper, let a modular Vertex AI agent pipeline extract the core ideas,
          then iterate in an executable Python sandbox with implementation guidance and Q&amp;A.
        </p>
      </section>

      {!ready ? <div className="card"><p className="muted">Loading workspace...</p></div> : null}
      {ready && session ? <DashboardClient session={session} onLoggedOut={() => setSession(null)} /> : null}
      {ready && !session ? <AuthPanel onAuthed={setSession} /> : null}
    </main>
  );
}
