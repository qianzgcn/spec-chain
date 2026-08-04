import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import { createAutomationInputFingerprint } from "@/automation/fingerprint";
import {
  AUTOMATION_SCRIPT_STATUS_META,
  getAutomationScriptStatus,
} from "@/automation/script-status";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
import { TestCaseDetailActions } from "@/components/test-cases/test-case-detail-actions";
import { Badge } from "@/components/ui/badge";
import {
  AiCapability,
  AiExecutionOrigin,
  AiExecutionStatus,
} from "@/generated/prisma/enums";
import { TEST_PRIORITY_META } from "@/lib/test-cases/meta";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "测试用例详情",
};

export default async function TestCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, project] = await Promise.all([params, getCurrentProject()]);
  if (!project) notFound();

  const testCase = await db.testCase.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    include: {
      group: { select: { name: true } },
      userStory: {
        select: {
          id: true,
          code: true,
          title: true,
          deletedAt: true,
          feature: { select: { name: true } },
        },
      },
      project: {
        select: {
          baseUrl: true,
          automationInstructions: true,
          variables: {
            where: { deletedAt: null },
            orderBy: { position: "asc" },
            select: {
              name: true,
              kind: true,
              encrypted: true,
              description: true,
              fields: {
                orderBy: { position: "asc" },
                select: {
                  name: true,
                  kind: true,
                  encrypted: true,
                  description: true,
                },
              },
            },
          },
        },
      },
      aiExecutions: {
        where: {
          capability: AiCapability.GENERATE_AUTOMATION_SCRIPT,
          origin: AiExecutionOrigin.USER,
          status: {
            in: [AiExecutionStatus.QUEUED, AiExecutionStatus.RUNNING],
          },
          deletedAt: null,
        },
        orderBy: { queuedAt: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });
  if (!testCase) notFound();

  const priorityMeta = TEST_PRIORITY_META[testCase.priority];
  const currentFingerprint = createAutomationInputFingerprint({
    testCase,
    baseUrl: testCase.project.baseUrl ?? "",
    automationInstructions: testCase.project.automationInstructions,
    variables: testCase.project.variables,
  });
  const scriptStatus = getAutomationScriptStatus({
    script: testCase.script,
    source: testCase.scriptSource,
    aiFingerprint: testCase.aiScriptFingerprint,
    currentFingerprint,
  });
  const scriptStatusMeta = AUTOMATION_SCRIPT_STATUS_META[scriptStatus];

  return (
    <PageContainer className="flex flex-col gap-5">
      <PageHeader
        title={testCase.name}
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
          <TestCaseDetailActions
            id={testCase.id}
            scriptStatus={scriptStatus}
            hasBaseUrl={Boolean(testCase.project.baseUrl)}
            activeGenerationTaskId={testCase.aiExecutions[0]?.id ?? null}
          />
        }
      />

      <PageSection title="用例内容">
        <div className="flex flex-col gap-5">
          <div className="bg-muted/50 flex min-w-0 flex-col gap-2 rounded-lg p-4">
            <h3 className="text-sm font-medium">前置条件</h3>
            <p className="text-sm leading-6 break-words whitespace-pre-wrap">
              {testCase.preconditions?.trim() || "无"}
            </p>
          </div>
          <div className="bg-muted/50 flex min-w-0 flex-col gap-2 rounded-lg p-4">
            <h3 className="text-sm font-medium">测试步骤</h3>
            <p className="text-sm leading-6 break-words whitespace-pre-wrap">
              {testCase.steps}
            </p>
          </div>
        </div>
      </PageSection>

      <PageSection title="关联 US">
        {testCase.userStory ? (
          testCase.userStory.deletedAt ? (
            <span className="text-muted-foreground text-sm">
              {testCase.userStory.code} · {testCase.userStory.title}（已删除）
            </span>
          ) : (
            <Link
              className="text-sm font-medium underline-offset-4 hover:underline"
              href={`/user-stories/${testCase.userStory.id}`}
            >
              {testCase.userStory.code} · {testCase.userStory.title}
              {testCase.userStory.feature
                ? `（${testCase.userStory.feature.name}）`
                : ""}
            </Link>
          )
        ) : (
          <span className="text-muted-foreground text-sm">未关联 US</span>
        )}
      </PageSection>

      <PageSection
        title="Playwright TypeScript 脚本"
        actions={
          <Badge variant={scriptStatusMeta.badgeVariant}>
            {scriptStatusMeta.label}
          </Badge>
        }
      >
        {testCase.script ? (
          <pre className="max-h-[520px] overflow-auto rounded-lg border border-slate-800 bg-[#0d1117] p-5 font-mono text-xs leading-6 whitespace-pre-wrap text-slate-100">
            <code>{testCase.script}</code>
          </pre>
        ) : (
          <span className="text-muted-foreground text-sm">
            尚未编写自动化脚本
          </span>
        )}
      </PageSection>
    </PageContainer>
  );
}
