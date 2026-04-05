import { PaperWorkspaceClient } from '@/components/PaperWorkspaceClient';

export default async function PaperQaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <PaperWorkspaceClient paperId={id} view="qa" />;
}
