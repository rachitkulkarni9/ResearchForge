import { PaperWorkspaceClient } from '@/components/PaperWorkspaceClient';

export default async function PaperInsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <PaperWorkspaceClient paperId={id} view="insights" />;
}
