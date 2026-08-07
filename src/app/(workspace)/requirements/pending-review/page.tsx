import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectRequiredState } from "@/components/projects/project-required-state";
import {
  PendingRequirementsList,
  type PendingRequirementListItem,
} from "@/components/requirements/pending-requirements-list";
import { AiDraftStatus } from "@/generated/prisma/enums";
import { AiExecutionStatus } from "@/generated/prisma/enums";
import { parsePage, parsePageSize } from "@/lib/pagination";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "待评审需求",
};

export default async function PendingReviewRequirementsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  const [project, params] = await Promise.all([
    getCurrentProject(),
    searchParams,
  ]);

  if (!project) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <PageHeader
          title="待评审需求"
          description="查看并确认 AI 生成的 US 草稿。"
        />
        <ProjectRequiredState />
      </PageContainer>
    );
  }

  const pageSize = parsePageSize(params.pageSize);
  const page = parsePage(params.page);
  const where = {
    projectId: project.id,
    status: AiDraftStatus.PENDING,
    deletedAt: null,
    sourceExecution: { status: AiExecutionStatus.SUCCEEDED },
  };
  const total = await db.userStoryDraft.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const drafts = await db.userStoryDraft.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip: (safePage - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      feature: { select: { code: true, name: true } },
      sourceExecution: {
        select: {
          requestedBy: { select: { username: true } },
        },
      },
    },
  });

  const items: PendingRequirementListItem[] = drafts.map((draft) => ({
    ...draft,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
    createdBy: draft.sourceExecution.requestedBy.username,
  }));

  return (
    <PageContainer table className="gap-5">
      <PageHeader
        title="待评审需求"
        description="集中检查 AI 生成的 US 内容；确认后才会进入正式需求列表。"
      />
      <PendingRequirementsList
        items={items}
        total={total}
        page={safePage}
        pageSize={pageSize}
      />
    </PageContainer>
  );
}
