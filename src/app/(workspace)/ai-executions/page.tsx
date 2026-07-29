import type { Metadata } from "next";

import { Button, Empty } from "antd";

import { AiExecutionsList } from "@/components/ai/ai-executions-list";
import { PageHeader } from "@/components/layout/page-header";
import { getAiExecutionSummaries } from "@/server/ai/execution-dto";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "AI 执行记录",
};

export default async function AiExecutionsPage() {
  const project = await getCurrentProject();
  if (!project) {
    return (
      <div className="page-shell">
        <PageHeader title="AI 执行记录" description="请先创建项目。" />
        <div className="content-panel empty-panel">
          <Empty description="请先创建项目">
            <Button type="primary" href="/projects">
              前往项目管理
            </Button>
          </Empty>
        </div>
      </div>
    );
  }

  const executions = await getAiExecutionSummaries(project.id);
  return (
    <div className="page-shell page-shell--table">
      <PageHeader
        title="AI 执行记录"
        description="查看当前项目的 AI 任务进度、执行日志和生成结果。"
      />

      <AiExecutionsList initialExecutions={executions} />
    </div>
  );
}
