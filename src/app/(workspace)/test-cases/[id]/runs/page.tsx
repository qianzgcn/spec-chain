import type { Metadata } from "next";

import ArrowLeftOutlined from "@ant-design/icons/ArrowLeftOutlined";
import { Button, Tag } from "antd";
import { notFound } from "next/navigation";

import {
  TestRunPanel,
  type TestRunSummary,
} from "@/components/test-cases/test-run-panel";
import { TEST_PRIORITY_META } from "@/lib/test-cases/meta";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "执行记录",
};

export default async function TestCaseRunsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, project] = await Promise.all([params, getCurrentProject()]);
  if (!project) notFound();

  const testCase = await db.testCase.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      priority: true,
      enabled: true,
      script: true,
      group: { select: { name: true } },
      runs: {
        orderBy: { queuedAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          queuedAt: true,
          startedAt: true,
          durationMs: true,
          requestedBy: { select: { username: true } },
        },
      },
    },
  });
  if (!testCase) notFound();

  const initialRuns: TestRunSummary[] = testCase.runs.map((run) => ({
    id: run.id,
    status: run.status,
    queuedAt: run.queuedAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    durationMs: run.durationMs,
    requestedBy: run.requestedBy.username,
  }));

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-xs text-slate-500">
              {testCase.code}
            </span>
            <Tag color={TEST_PRIORITY_META[testCase.priority].color}>
              {testCase.priority}
            </Tag>
            <Tag color={testCase.enabled ? "success" : "default"}>
              {testCase.enabled ? "已启用" : "已停用"}
            </Tag>
            <span className="text-xs text-slate-500">
              {testCase.group.name}
            </span>
          </div>
          <h1 className="page-title">执行记录</h1>
          <p className="page-description">{testCase.name}</p>
        </div>
        <Button
          icon={<ArrowLeftOutlined />}
          href={`/test-cases/${testCase.id}`}
        >
          返回用例详情
        </Button>
      </div>

      <TestRunPanel
        testCaseId={testCase.id}
        enabled={testCase.enabled}
        hasScript={Boolean(testCase.script?.trim())}
        hasBaseUrl={Boolean(project.baseUrl)}
        initialRuns={initialRuns}
      />
    </div>
  );
}
