import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectRequiredState } from "@/components/projects/project-required-state";
import {
  PendingTestCasesList,
  type PendingTestCaseListItem,
} from "@/components/test-cases/pending-test-cases-list";
import { AiDraftStatus, AiExecutionStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "待评审用例",
};

export default async function PendingReviewTestCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; batch?: string }>;
}) {
  const [project, params] = await Promise.all([
    getCurrentProject(),
    searchParams,
  ]);

  if (!project) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <PageHeader
          title="待评审用例"
          description="查看并确认 AI 生成的测试用例。"
        />
        <ProjectRequiredState />
      </PageContainer>
    );
  }

  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const batchId = params.batch?.trim() || undefined;
  const where = {
    status: AiDraftStatus.PENDING,
    deletedAt: null,
    batch: {
      projectId: project.id,
      deletedAt: null,
      sourceExecution: { status: AiExecutionStatus.SUCCEEDED },
      ...(batchId ? { id: batchId } : {}),
    },
  };
  const [total, groups] = await Promise.all([
    db.testCaseDraft.count({ where }),
    db.testCaseGroup.findMany({
      where: { projectId: project.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / 20));
  const safePage = Math.min(page, pageCount);
  const drafts = await db.testCaseDraft.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (safePage - 1) * 20,
    take: 20,
    select: {
      id: true,
      name: true,
      priority: true,
      groupId: true,
      createdAt: true,
      proposedUserStory: {
        select: { code: true, title: true, deletedAt: true },
      },
      batch: {
        select: {
          sourceExecution: {
            select: {
              requirementText: true,
              sourceUserStory: {
                select: {
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
  const activeGroupIds = new Set(groups.map((group) => group.id));

  const items: PendingTestCaseListItem[] = drafts.map((draft) => ({
    id: draft.id,
    name: draft.name,
    priority: draft.priority,
    groupId:
      draft.groupId && activeGroupIds.has(draft.groupId) ? draft.groupId : null,
    requirementText: draft.batch.sourceExecution.requirementText,
    sourceUserStory:
      (draft.proposedUserStory ?? draft.batch.sourceExecution.sourceUserStory)
        ? {
            code: (draft.proposedUserStory ??
              draft.batch.sourceExecution.sourceUserStory)!.code,
            title: (draft.proposedUserStory ??
              draft.batch.sourceExecution.sourceUserStory)!.title,
            deleted: Boolean(
              (draft.proposedUserStory ??
                draft.batch.sourceExecution.sourceUserStory)!.deletedAt,
            ),
          }
        : null,
    createdAt: draft.createdAt.toISOString(),
  }));

  return (
    <PageContainer table className="gap-5">
      <PageHeader
        title="待评审用例"
        description="检查 AI 生成的测试用例，选择分组后即可通过评审。"
      />
      <PendingTestCasesList
        key={items
          .map(
            (item) => `${item.id}:${item.groupId ?? "none"}:${item.priority}`,
          )
          .join("|")}
        items={items}
        groups={groups}
        total={total}
        page={safePage}
        batchId={batchId}
      />
    </PageContainer>
  );
}
