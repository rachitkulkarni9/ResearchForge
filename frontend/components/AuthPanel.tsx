'use client';

import { FormEvent, useState } from 'react';
import { GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, updateProfile } from 'firebase/auth';
import { AlertCircle, Eye, EyeOff, FlaskConical, Loader2, Lock, Mail } from 'lucide-react';

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

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path d="M21.805 10.023H12v3.955h5.627c-.243 1.274-.972 2.354-2.07 3.08v2.558h3.35c1.962-1.807 3.098-4.47 3.098-7.616 0-.662-.06-1.298-.2-1.977Z" fill="#4285F4" />
      <path d="M12 22c2.807 0 5.162-.93 6.883-2.52l-3.35-2.558c-.93.624-2.12.995-3.533.995-2.716 0-5.017-1.834-5.84-4.3H2.703v2.638A10.4 10.4 0 0 0 12 22Z" fill="#34A853" />
      <path d="M6.16 13.617A6.237 6.237 0 0 1 5.833 12c0-.562.1-1.108.286-1.617V7.745H2.703A10.03 10.03 0 0 0 1.667 12c0 1.61.386 3.13 1.036 4.255l3.457-2.638Z" fill="#FBBC05" />
      <path d="M12 6.083c1.523 0 2.887.524 3.964 1.55l2.97-2.97C17.157 2.99 14.807 2 12 2A10.4 10.4 0 0 0 2.703 7.745l3.416 2.638c.818-2.466 3.12-4.3 5.88-4.3Z" fill="#EA4335" />
    </svg>
  );
}

export function AuthPanel({ onAuthed, initialMode = 'login' }: AuthPanelProps) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function syncSession() {
    const data = await apiFetch<SessionResponse>('/auth/session');
    onAuthed(data);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (firebaseAuth && firebaseEnabled) {
        await ensureFirebasePersistence();

        if (mode === 'signup') {
          const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
          if (name.trim()) {
            await updateProfile(credential.user, { displayName: name.trim() });
            await credential.user.getIdToken(true);
          }
        } else {
          await signInWithEmailAndPassword(firebaseAuth, email, password);
        }
      } else {
        if (mode === 'signup') {
          await apiFetch('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ email, name, password }),
          });
        } else {
          await apiFetch('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          });
        }
      }
      await syncSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  async function loginWithGoogle() {
    if (!firebaseAuth || !firebaseEnabled) {
      setError('Firebase Auth is not configured. Add the NEXT_PUBLIC_FIREBASE_* env values and restart the frontend.');
      return;
    }

    setLoading(true);
    setError('');

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
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center text-center">
        <FlaskConical className="h-8 w-8 text-violet-600" />
        <div className="mt-3 text-xl font-bold text-gray-900 dark:text-gray-100">ResearchForge</div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 px-4 py-2 text-sm transition-all ${
              mode === 'login'
                ? 'rounded-md bg-white font-medium text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 px-4 py-2 text-sm transition-all ${
              mode === 'signup'
                ? 'rounded-md bg-white font-medium text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Create account
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className={`overflow-hidden transition-all duration-200 ${mode === 'signup' ? 'max-h-28 opacity-100' : 'max-h-0 opacity-0'}`}>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
            <input
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ada Lovelace"
              required={mode === 'signup'}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ada@researchforge.dev"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error ? (
            <div className="flex items-center gap-1.5 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          ) : null}

          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? (mode === 'login' ? 'Signing in...' : 'Creating account...') : (mode === 'login' ? 'Sign in' : 'Create account')}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
          <div className="text-xs text-gray-400">or continue with</div>
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
        </div>

        <button
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          disabled={loading}
          onClick={() => void loginWithGoogle()}
          type="button"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <div className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="font-medium text-violet-600 transition-colors hover:text-violet-700"
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
