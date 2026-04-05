import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading ResearchForge...</p>
      </div>
    </main>
  );
}
