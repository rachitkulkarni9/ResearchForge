'use client';

import { FlaskConical, Sparkles } from 'lucide-react';

import { AuthPanel } from '@/components/AuthPanel';
import { useAppShellSession } from '@/components/AppShellContext';
import { DashboardClient } from '@/components/DashboardClient';

export default function HomePage() {
  const { ready, session, setSession } = useAppShellSession();

  return (
    <main className="text-gray-900 dark:text-gray-100">
      {ready && session ? <DashboardClient session={session} onLoggedOut={() => setSession(null)} /> : null}

      {!session ? (
        <div className="min-h-screen lg:grid lg:grid-cols-[1.22fr_0.78fr] xl:grid-cols-[1.26fr_0.74fr]">
          <section className="flex bg-white dark:bg-gray-950">
            <div className="mx-auto flex w-full max-w-[52rem] flex-col justify-center px-8 py-16 sm:px-12 lg:px-14 xl:px-16">
              <div className="inline-flex w-fit items-center gap-3 rounded-full bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                <FlaskConical className="h-4 w-4" />
                ResearchForge
              </div>

              <div className="mt-8 space-y-5">
                <h1 className="whitespace-nowrap text-4xl font-semibold tracking-tight text-gray-900 dark:text-gray-100 sm:text-5xl lg:text-[3.15rem] xl:text-[3.35rem]">
                  Turn research into reality.
                </h1>
                <h2 className="whitespace-nowrap text-4xl font-semibold tracking-tight text-gray-900 dark:text-gray-100 sm:text-5xl lg:text-[3.15rem] xl:text-[3.35rem]">
                  Run it. Break it. Learn it.
                </h2>
                <p className="max-w-4xl text-2xl leading-10 text-gray-500 dark:text-gray-400">
                  Read faster, build sooner, and test ideas in one workspace.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                {[
                  'Fast paper ingestion',
                  'Structured research insights',
                  'Sandbox-backed experimentation',
                ].map((item) => (
                  <div key={item} className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                    <Sparkles className="h-4 w-4 text-violet-500 dark:text-violet-300" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="flex items-center justify-center bg-violet-50 px-6 py-16 sm:px-10 lg:px-16 dark:bg-gray-900">
            {!ready ? (
              <div className="w-full max-w-sm rounded-2xl border border-violet-100 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-950">
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading workspace...</p>
              </div>
            ) : (
              <AuthPanel onAuthed={setSession} />
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
