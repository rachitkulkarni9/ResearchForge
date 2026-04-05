'use client';

import { FormEvent, useEffect, useState } from 'react';
import { GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, updateProfile } from 'firebase/auth';

import { apiFetch } from '@/lib/api';
import { ensureFirebasePersistence, firebaseAuth, firebaseEnabled } from '@/lib/firebase';

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

interface AuthPanelProps {
  onAuthed: (session: SessionResponse) => void;
  initialMode?: 'login' | 'signup';
}

export function AuthPanel({ onAuthed, initialMode = 'login' }: AuthPanelProps) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  async function syncSession() {
    const data = await apiFetch<SessionResponse>('/auth/session');
    onAuthed(data);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    if (!firebaseAuth || !firebaseEnabled) {
      setError('Firebase Auth is not configured. Add the NEXT_PUBLIC_FIREBASE_* env values and restart the frontend.');
      setLoading(false);
      return;
    }

    try {
      await ensureFirebasePersistence();
      if (mode === 'signup') {
        const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        if (name.trim()) {
          await updateProfile(credential.user, { displayName: name.trim() });
        }
        await credential.user.getIdToken(true);
      } else {
        await signInWithEmailAndPassword(firebaseAuth, email, password);
      }
      await syncSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  async function loginWithGoogle() {
    setLoading(true);
    setError('');

    if (!firebaseAuth || !firebaseEnabled) {
      setError('Firebase Auth is not configured. Add the NEXT_PUBLIC_FIREBASE_* env values and restart the frontend.');
      setLoading(false);
      return;
    }

    try {
      await ensureFirebasePersistence();
      await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
      await syncSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-card">
      <div className="auth-card-glow auth-card-glow-top" />
      <div className="auth-card-glow auth-card-glow-bottom" />
      <div className="auth-card-header">
        <div>
          <h2>{mode === 'login' ? 'Welcome back to your research lab.' : 'Create your ResearchForge workspace.'}</h2>
        </div>
        <div className="auth-mode-switch" aria-label="Authentication mode">
          <button
            className={`auth-mode-pill ${mode === 'login' ? 'active' : ''}`}
            onClick={() => setMode('login')}
            type="button"
          >
            Login
          </button>
          <button
            className={`auth-mode-pill ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => setMode('signup')}
            type="button"
          >
            Sign up
          </button>
        </div>
      </div>

      <form className="auth-form stack" onSubmit={handleSubmit}>
        {mode === 'signup' ? (
          <div>
            <label className="label auth-label">Name</label>
            <input className="input auth-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" required />
          </div>
        ) : null}
        <div>
          <label className="label auth-label">Email</label>
          <input className="input auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ada@researchforge.dev" required />
        </div>
        <div>
          <label className="label auth-label">Password</label>
          <input className="input auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} required />
        </div>
        <div className="auth-actions">
          <button className="button auth-submit" disabled={loading} type="submit">
            {loading ? (mode === 'login' ? 'Logging in...' : 'Creating account...') : (mode === 'login' ? 'Enter ResearchForge' : 'Create workspace')}
          </button>
          <button className="button ghost auth-google" disabled={loading} onClick={() => void loginWithGoogle()} type="button">
            <span className="auth-google-icon" aria-hidden="true">
              <svg viewBox="0 0 18 18" width="18" height="18" role="img" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.33-1.58-5.04-3.7H.96v2.33A9 9 0 0 0 9 18Z"/>
                <path fill="#FBBC05" d="M3.96 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3-2.33Z"/>
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.43 1.35l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.95l3 2.33c.71-2.12 2.7-3.7 5.04-3.7Z"/>
              </svg>
            </span>
            <span>{loading ? 'Connecting to Google...' : 'Continue with Google'}</span>
          </button>
        </div>
        {error ? <p className="auth-error">{error}</p> : null}
      </form>
    </section>
  );
}
