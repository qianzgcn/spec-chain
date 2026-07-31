import type { Metadata } from "next";

import { ArrowLeftIcon } from "lucide-react";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/navigation/button-link";
import {
  TestRunPanel,
  type TestRunSummary,
} from "@/components/test-cases/test-run-panel";
import { Badge } from "@/components/ui/badge";
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
        where: { deletedAt: null },
        orderBy: { queuedAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          stage: true,
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
    stage: run.stage,
    queuedAt: run.queuedAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    durationMs: run.durationMs,
    requestedBy: run.requestedBy.username,
  }));
  const priorityMeta = TEST_PRIORITY_META[testCase.priority];

  return (
    <PageContainer className="flex flex-col gap-5">
      <PageHeader
        title="执行记录"
        description={testCase.name}
        meta={
          <>
            <span className="font-mono text-xs">{testCase.code}</span>
            <Badge variant={priorityMeta.badgeVariant}>
              {priorityMeta.label}
            </Badge>
            <Badge variant={testCase.enabled ? "success" : "outline"}>
              {testCase.enabled ? "已启用" : "已停用"}
            </Badge>
            <span>{testCase.group.name}</span>
          </>
        }
        actions={
          <ButtonLink href={`/test-cases/${testCase.id}`} variant="outline">
            <ArrowLeftIcon data-icon="inline-start" />
            返回用例详情
          </ButtonLink>
        }
      />

      <TestRunPanel
        testCaseId={testCase.id}
        enabled={testCase.enabled}
        hasBaseUrl={Boolean(project.baseUrl)}
        initialRuns={initialRuns}
      />
    </PageContainer>
  );
}
