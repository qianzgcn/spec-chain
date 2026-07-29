import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { AiExecutionDetailPanel } from "@/components/ai/ai-execution-detail";
import { getAiExecutionDetail } from "@/server/ai/execution-dto";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "AI 执行详情",
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
    <div className="page-shell">
      <AiExecutionDetailPanel initialExecution={execution} />
    </div>
  );
}
