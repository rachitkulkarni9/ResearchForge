'use client';

import { FormEvent, useState } from 'react';

import { apiFetch, setToken } from '@/lib/api';

interface AuthPanelProps {
  onAuthed: () => void;
}

export function AuthPanel({ onAuthed }: AuthPanelProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await apiFetch<{ access_token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, name }),
      });
      setToken(data.access_token);
      onAuthed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card stack">
      <div>
        <h2>Sign in</h2>
        <p className="muted">Hackathon auth uses email plus name and returns a workspace-scoped bearer token.</p>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" required />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ada@paperlab.dev" required />
        </div>
        <div className="button-row">
          <button className="button" disabled={loading} type="submit">{loading ? 'Signing in...' : 'Enter PaperLab'}</button>
        </div>
        {error ? <p style={{ color: 'var(--error)' }}>{error}</p> : null}
      </form>
    </div>
  );
}
