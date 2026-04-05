'use client';

import Image from 'next/image';
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
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

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
      {ready && !session ? (
        <section className="landing-shell">
          <div className="landing-backdrop landing-backdrop-left" />
          <div className="landing-backdrop landing-backdrop-right" />
          <div className="landing-artwork" aria-hidden="true">
            <Image
              src="/auth-research-hero.svg"
              alt=""
              width={960}
              height={780}
              priority
            />
          </div>

          <div className="landing-copy">
            <div className="landing-topbar">
              <div className="landing-brand">
                <span className="landing-brand-mark">RF</span>
                <span>ResearchForge</span>
              </div>
              <nav className="landing-nav">
                <button
                  className="landing-nav-link"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthOpen(true);
                  }}
                  type="button"
                >
                  Login
                </button>
                <button
                  className="landing-nav-link landing-nav-link-primary"
                  onClick={() => {
                    setAuthMode('signup');
                    setAuthOpen(true);
                  }}
                  type="button"
                >
                  Sign up
                </button>
              </nav>
            </div>

            <div className="landing-copy-stack">
              <div className="eyebrow landing-eyebrow">Research Workspace</div>
              <h1>Build what the paper only begins.</h1>
              <p>Read faster, build sooner, and test ideas in one workspace.</p>
            </div>

            <div className="landing-metrics">
              <div className="landing-metric">
                <strong>Summary</strong>
                <span>Section-by-section synthesis for fast review.</span>
              </div>
              <div className="landing-metric">
                <strong>Insights</strong>
                <span>Novelty, limitations, and math explanations in one pass.</span>
              </div>
              <div className="landing-metric">
                <strong>Sandbox</strong>
                <span>Starter Python code you can edit and run immediately.</span>
              </div>
            </div>
          </div>

          {authOpen ? (
            <div className="auth-modal-backdrop" onClick={() => setAuthOpen(false)} role="presentation">
              <div className="auth-modal-shell" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
                <button className="auth-modal-close" onClick={() => setAuthOpen(false)} type="button" aria-label="Close auth panel">
                  x
                </button>
                <AuthPanel
                  initialMode={authMode}
                  onAuthed={(nextSession) => {
                    setSession(nextSession);
                    setAuthOpen(false);
                  }}
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {!ready ? <div className="card"><p className="muted">Loading workspace...</p></div> : null}
      {ready && session ? (
        <>
          <section className="hero">
            <h1>ResearchForge turns research papers into working sandboxes.</h1>
            <p>
              Upload a formula-heavy ML paper, let a modular Vertex AI agent pipeline extract the core ideas,
              then iterate in an executable Python sandbox with implementation guidance and Q&amp;A.
            </p>
          </section>
          <DashboardClient session={session} onLoggedOut={() => setSession(null)} />
        </>
      ) : null}
    </main>
  );
}
