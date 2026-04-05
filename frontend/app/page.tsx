'use client';

import { useEffect, useState } from 'react';
import { onIdTokenChanged, signOut, type User } from 'firebase/auth';

import { AuthPanel } from '@/components/AuthPanel';
import { DashboardClient } from '@/components/DashboardClient';
import { apiFetch } from '@/lib/api';
import { ensureFirebasePersistence, firebaseAuth, waitForFirebaseAuthReady } from '@/lib/firebase';

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
    let active = true;
    let unsubscribe: () => void = () => {};

    async function syncSession(user: User | null) {
      if (!active) {
        return;
      }
      if (!user) {
        setSession(null);
        setReady(true);
        return;
      }

      try {
        const data = await apiFetch<SessionResponse>('/auth/session');
        if (active) {
          setSession(data);
        }
      } catch {
        if (active) {
          setSession(null);
          if (firebaseAuth) {
            await signOut(firebaseAuth);
          }
        }
      } finally {
        if (active) {
          setReady(true);
        }
      }
    }

    async function bootstrap() {
      await ensureFirebasePersistence();
      await waitForFirebaseAuthReady();

      if (!firebaseAuth) {
        setReady(true);
        return;
      }

      unsubscribe = onIdTokenChanged(firebaseAuth, (user) => {
        void syncSession(user);
      });

      await syncSession(firebaseAuth.currentUser);
    }

    void bootstrap();
    return () => {
      active = false;
      unsubscribe();
    };
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
