import type { Metadata } from "next";

import { AiExecutionsList } from "@/components/ai/ai-executions-list";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectRequiredState } from "@/components/projects/project-required-state";
import { getAiExecutionSummaries } from "@/server/ai/execution-dto";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "执行任务",
};

export default async function AiExecutionsPage() {
  const project = await getCurrentProject();
  if (!project) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <PageHeader title="执行任务" description="请先创建项目。" />
        <ProjectRequiredState />
      </PageContainer>
    );
  }

  const executions = await getAiExecutionSummaries(project.id);
  return (
    <PageContainer table className="gap-5">
      <PageHeader
        title="执行任务"
        description="查看当前项目的 AI 任务、最新执行状态和生成结果。"
      />

      <AiExecutionsList initialExecutions={executions} />
    </PageContainer>
  );
}
