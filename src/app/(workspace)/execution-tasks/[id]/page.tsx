import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { ExecutionTaskDetailPanel } from "@/components/execution-tasks/execution-task-detail";
import { PageContainer } from "@/components/layout/page-container";
import { getExecutionTaskDetail } from "@/server/execution-tasks/dto";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "任务详情",
};

export default async function ExecutionTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, project] = await Promise.all([params, getCurrentProject()]);
  if (!project) notFound();

  const task = await getExecutionTaskDetail(project.id, id);
  if (!task) notFound();

  return (
    <PageContainer>
      <ExecutionTaskDetailPanel initialTask={task} />
    </PageContainer>
  );
}
