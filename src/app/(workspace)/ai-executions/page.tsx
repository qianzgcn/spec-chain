import type { Metadata } from "next";

import { AiExecutionsList } from "@/components/ai/ai-executions-list";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectRequiredState } from "@/components/projects/project-required-state";
import { getAiExecutionSummaries } from "@/server/ai/execution-dto";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "AI 执行记录",
};

export default async function AiExecutionsPage() {
  const project = await getCurrentProject();
  if (!project) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <PageHeader title="AI 执行记录" description="请先创建项目。" />
        <ProjectRequiredState />
      </PageContainer>
    );
  }

  const executions = await getAiExecutionSummaries(project.id);
  return (
    <PageContainer table className="gap-5">
      <PageHeader
        title="AI 执行记录"
        description="查看当前项目的 AI 任务进度、执行日志和生成结果。"
      />

      <AiExecutionsList initialExecutions={executions} />
    </PageContainer>
  );
}
