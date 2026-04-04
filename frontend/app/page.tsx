'use client';

import { useEffect, useState } from 'react';

import { AuthPanel } from '@/components/AuthPanel';
import { DashboardClient } from '@/components/DashboardClient';
import { getToken } from '@/lib/api';

export default function HomePage() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(Boolean(getToken()));
  }, []);

  return (
    <main className="shell stack">
      <section className="hero">
        <h1>PaperLab turns research papers into working sandboxes.</h1>
        <p>
          Upload a formula-heavy ML paper, let a modular Gemini agent pipeline extract the core ideas,
          then iterate in an executable Python sandbox with implementation guidance and Q&A.
        </p>
      </section>

      {authed ? <DashboardClient /> : <AuthPanel onAuthed={() => setAuthed(true)} />}
    </main>
  );
}
