import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
import { PendingTestCaseDetailActions } from "@/components/test-cases/pending-test-case-detail-actions";
import { Badge } from "@/components/ui/badge";
import { AiDraftStatus } from "@/generated/prisma/enums";
import { formatDetailedDateTime } from "@/lib/date-time";
import { TEST_PRIORITY_META } from "@/lib/test-cases/meta";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "待评审用例详情",
};

export default async function PendingReviewTestCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, project] = await Promise.all([params, getCurrentProject()]);
  if (!project) notFound();

  const draft = await db.testCaseDraft.findFirst({
    where: {
      id,
      status: AiDraftStatus.PENDING,
      deletedAt: null,
      batch: {
        projectId: project.id,
        deletedAt: null,
      },
    },
    select: {
      id: true,
      name: true,
      priority: true,
      preconditions: true,
      steps: true,
      createdAt: true,
      group: {
        select: {
          name: true,
          deletedAt: true,
        },
      },
      loginProfile: {
        select: {
          name: true,
          deletedAt: true,
        },
      },
      batch: {
        select: {
          sourceExecution: {
            select: {
              requirementText: true,
              sourceUserStory: {
                select: {
                  id: true,
                  code: true,
                  title: true,
                  deletedAt: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!draft) notFound();

  const priorityMeta = TEST_PRIORITY_META[draft.priority];
  const activeGroup =
    draft.group && !draft.group.deletedAt ? draft.group : null;
  const sourceUserStory = draft.batch.sourceExecution.sourceUserStory;

  return (
    <PageContainer className="flex flex-col gap-5">
      <PageHeader
        title={draft.name}
        meta={
          <>
            <Badge variant="warning">待评审</Badge>
            <Badge variant={priorityMeta.badgeVariant}>
              {priorityMeta.label}
            </Badge>
            <span>{activeGroup?.name ?? "未分组"}</span>
            <span>
              {draft.loginProfile && !draft.loginProfile.deletedAt
                ? draft.loginProfile.name
                : "不预登录"}
            </span>
            <span>{formatDetailedDateTime(draft.createdAt.toISOString())}</span>
          </>
        }
        actions={
          <PendingTestCaseDetailActions
            id={draft.id}
            hasGroup={Boolean(activeGroup)}
          />
        }
      />

      <PageSection title="用例内容">
        <div className="flex flex-col gap-5">
          <div className="bg-muted/50 flex min-w-0 flex-col gap-2 rounded-lg p-4">
            <h3 className="text-sm font-medium">前置条件</h3>
            <p className="text-sm leading-6 break-words whitespace-pre-wrap">
              {draft.preconditions?.trim() || "无"}
            </p>
          </div>
          <div className="bg-muted/50 flex min-w-0 flex-col gap-2 rounded-lg p-4">
            <h3 className="text-sm font-medium">测试步骤</h3>
            <p className="text-sm leading-6 break-words whitespace-pre-wrap">
              {draft.steps}
            </p>
          </div>
        </div>
      </PageSection>

      <PageSection title="生成来源">
        {sourceUserStory ? (
          sourceUserStory.deletedAt ? (
            <span className="text-muted-foreground text-sm">
              {sourceUserStory.code} · {sourceUserStory.title}（已删除）
            </span>
          ) : (
            <Link
              className="text-sm font-medium underline-offset-4 hover:underline"
              href={`/user-stories/${sourceUserStory.id}`}
            >
              {sourceUserStory.code} · {sourceUserStory.title}
            </Link>
          )
        ) : (
          <p className="text-sm leading-6 break-words whitespace-pre-wrap">
            {draft.batch.sourceExecution.requirementText}
          </p>
        )}
      </PageSection>
    </PageContainer>
  );
}
