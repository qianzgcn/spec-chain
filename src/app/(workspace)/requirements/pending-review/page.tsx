import type { Metadata } from "next";

import { Button, Empty } from "antd";

import { PageHeader } from "@/components/layout/page-header";
import {
  PendingRequirementsList,
  type PendingRequirementListItem,
} from "@/components/requirements/pending-requirements-list";
import { AiDraftStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "待评审需求",
};

export default async function PendingReviewRequirementsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const [project, params] = await Promise.all([
    getCurrentProject(),
    searchParams,
  ]);

  if (!project) {
    return (
      <div className="page-shell">
        <PageHeader
          title="待评审需求"
          description="查看并确认 AI 生成的 US 草稿。"
        />
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

  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const where = {
    projectId: project.id,
    status: AiDraftStatus.PENDING,
    deletedAt: null,
  };
  const total = await db.userStoryDraft.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / 20));
  const safePage = Math.min(page, pageCount);
  const drafts = await db.userStoryDraft.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip: (safePage - 1) * 20,
    take: 20,
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      feature: { select: { code: true, name: true } },
    },
  });

  const items: PendingRequirementListItem[] = drafts.map((draft) => ({
    ...draft,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  }));

  return (
    <div className="page-shell page-shell--table">
      <PageHeader
        title="待评审需求"
        description="集中检查 AI 生成的 US 内容；确认后才会进入正式需求列表。"
      />
      <PendingRequirementsList items={items} total={total} page={safePage} />
    </div>
  );
}
