import { PaperWorkspaceClient } from '@/components/PaperWorkspaceClient';

export default async function PaperImplementationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaperWorkspaceClient paperId={id} view="implementation" />;
}
