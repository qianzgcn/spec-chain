import type { Metadata } from "next";

import { Button, Empty } from "antd";

import { AiExecutionsList } from "@/components/ai/ai-executions-list";
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
        <div className="page-heading">
          <div>
            <h1 className="page-title">AI 执行记录</h1>
            <p className="page-description">请先创建项目。</p>
          </div>
        </div>
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
      <div className="page-heading">
        <div>
          <h1 className="page-title">AI 执行记录</h1>
          <p className="page-description">
            查看当前项目的 AI 任务进度、失败原因、代码证据和 US 草稿。
          </p>
        </div>
      </div>

      <AiExecutionsList initialExecutions={executions} />
    </div>
  );
}
