import type { Metadata } from "next";

import { ExecutionTaskList } from "@/components/execution-tasks/execution-task-list";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectRequiredState } from "@/components/projects/project-required-state";
import { getExecutionTaskSummaries } from "@/server/execution-tasks/dto";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "AI执行任务",
};

export default async function ExecutionTasksPage() {
  const project = await getCurrentProject();
  if (!project) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <PageHeader title="AI执行任务" description="请先创建项目。" />
        <ProjectRequiredState />
      </PageContainer>
    );
  }

  const tasks = await getExecutionTaskSummaries(project.id);
  return (
    <PageContainer table className="gap-5">
      <PageHeader
        title="AI执行任务"
        description="查看当前项目的 AI 辅助生成任务。"
      />

      <ExecutionTaskList initialTasks={tasks} />
    </PageContainer>
  );
}
