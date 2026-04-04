import Link from 'next/link';

import { PaperWorkspaceClient } from '@/components/PaperWorkspaceClient';

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="shell stack">
      <div className="button-row">
        <Link className="button ghost" href="/">Back to dashboard</Link>
      </div>
      <PaperWorkspaceClient paperId={id} view="overview" />
    </main>
  );
}
