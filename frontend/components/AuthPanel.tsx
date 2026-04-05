'use client';

import { FormEvent, useState } from 'react';
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
}

export function AuthPanel({ onAuthed }: AuthPanelProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    <div className="card stack">
      <div className="stack" style={{ gap: 10 }}>
        <div>
          <h2>{mode === 'login' ? 'Log in' : 'Create account'}</h2>
          <p className="muted">ResearchForge uses Firebase Authentication for email/password and Google sign-in.</p>
        </div>
        <div className="button-row">
          <button className={`button ${mode === 'login' ? '' : 'secondary'}`} onClick={() => setMode('login')} type="button">Login</button>
          <button className={`button ${mode === 'signup' ? '' : 'secondary'}`} onClick={() => setMode('signup')} type="button">Sign up</button>
          <button className="button ghost" disabled={loading} onClick={() => void loginWithGoogle()} type="button">Continue with Google</button>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        {mode === 'signup' ? (
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" required />
          </div>
        ) : null}
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ada@researchforge.dev" required />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} required />
        </div>
        <div className="button-row">
          <button className="button" disabled={loading} type="submit">
            {loading ? (mode === 'login' ? 'Logging in...' : 'Creating account...') : (mode === 'login' ? 'Enter ResearchForge' : 'Create workspace')}
          </button>
        </div>
        {error ? <p style={{ color: 'var(--error)' }}>{error}</p> : null}
      </form>
    </div>
  );
}
