import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
import { PendingTestCaseDetailActions } from "@/components/test-cases/pending-test-case-detail-actions";
import { PendingTestCaseReview } from "@/components/test-cases/pending-test-case-review";
import { Badge } from "@/components/ui/badge";
import {
  AiDraftStatus,
  AiExecutionStatus,
  TestCaseDraftChangeType,
} from "@/generated/prisma/enums";
import { formatDetailedDateTime } from "@/lib/date-time";
import { TEST_PRIORITY_META } from "@/lib/test-cases/meta";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "待评审用例详情",
};

const CHANGE_TYPE_LABELS = {
  [TestCaseDraftChangeType.CREATE]: "新增",
  [TestCaseDraftChangeType.UPDATE]: "更新",
  [TestCaseDraftChangeType.DELETE]: "删除",
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
        sourceExecution: { status: AiExecutionStatus.SUCCEEDED },
      },
    },
    select: {
      id: true,
      changeType: true,
      changeReason: true,
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
      targetTestCase: {
        select: {
          code: true,
          name: true,
          priority: true,
          preconditions: true,
          steps: true,
          group: { select: { name: true } },
        },
      },
      proposedUserStory: {
        select: { id: true, code: true, title: true, deletedAt: true },
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
  const sourceUserStory =
    draft.proposedUserStory ?? draft.batch.sourceExecution.sourceUserStory;

  return (
    <PageContainer className="flex flex-col gap-5">
      <PageHeader
        title={draft.name}
        meta={
          <>
            <Badge variant="warning">待评审</Badge>
            <Badge
              variant={
                draft.changeType === TestCaseDraftChangeType.DELETE
                  ? "destructive"
                  : draft.changeType === TestCaseDraftChangeType.UPDATE
                    ? "warning"
                    : "info"
              }
            >
              {CHANGE_TYPE_LABELS[draft.changeType]}
            </Badge>
            <Badge variant={priorityMeta.badgeVariant}>
              {priorityMeta.label}
            </Badge>
            <span>{activeGroup?.name ?? "未分组"}</span>
            <span>{formatDetailedDateTime(draft.createdAt.toISOString())}</span>
          </>
        }
        actions={
          <PendingTestCaseDetailActions
            id={draft.id}
            hasGroup={
              draft.changeType === TestCaseDraftChangeType.DELETE ||
              Boolean(activeGroup)
            }
          />
        }
      />

      <PendingTestCaseReview
        draftId={draft.id}
        changeType={draft.changeType}
        changeReason={draft.changeReason}
        current={draft.targetTestCase}
        proposed={{
          name: draft.name,
          priority: draft.priority,
          groupName: activeGroup?.name ?? "未分组",
          userStoryLabel: sourceUserStory
            ? `${sourceUserStory.code} · ${sourceUserStory.title}`
            : "平台用例",
          preconditions: draft.preconditions,
          steps: draft.steps,
        }}
      />

      <PageSection title="生成来源">
        {sourceUserStory ? (
          sourceUserStory.deletedAt ? (
            <span className="text-muted-foreground text-sm">
              {sourceUserStory.code} · {sourceUserStory.title}（已删除）
            </span>
          ) : (
            <Link
              className="text-link text-sm font-medium underline-offset-4 hover:underline"
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
