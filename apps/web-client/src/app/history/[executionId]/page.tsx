import { ExecutionHistoryDetail } from "@/components/history/execution-history-detail";

export default async function ExecutionHistoryDetailPage({
  params,
}: {
  params: Promise<{ executionId: string }>;
}) {
  const { executionId } = await params;
  return <ExecutionHistoryDetail executionId={executionId} />;
}
