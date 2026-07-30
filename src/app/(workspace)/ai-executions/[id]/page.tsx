import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { AiExecutionDetailPanel } from "@/components/ai/ai-execution-detail";
import { PageContainer } from "@/components/layout/page-container";
import { getAiExecutionDetail } from "@/server/ai/execution-dto";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "任务详情",
};

export default async function AiExecutionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, project] = await Promise.all([params, getCurrentProject()]);
  if (!project) notFound();

  const execution = await getAiExecutionDetail(project.id, id);
  if (!execution) notFound();

  return (
    <PageContainer>
      <AiExecutionDetailPanel initialExecution={execution} />
    </PageContainer>
  );
}
