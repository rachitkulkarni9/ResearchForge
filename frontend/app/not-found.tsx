import Link from 'next/link';
import { ArrowLeft, FlaskConical, SearchX } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-16 dark:bg-gray-950">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
          <SearchX className="h-6 w-6" />
        </div>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <FlaskConical className="h-3.5 w-3.5" />
          ResearchForge
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-gray-900 dark:text-gray-100">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">
          The workspace, paper view, or route you requested could not be found.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
