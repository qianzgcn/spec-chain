import type { Metadata } from "next";

import { Tag } from "antd";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { FeatureChildrenTable } from "@/components/requirements/feature-children-table";
import { RequirementDetailActions } from "@/components/requirements/requirement-detail-actions";
import { RequirementStatusBadge } from "@/components/requirements/requirement-status-badge";
import { deriveFeatureStatus } from "@/lib/requirements/status";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "FE 详情",
};

export default async function FeatureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, project] = await Promise.all([params, getCurrentProject()]);
  if (!project) notFound();

  const feature = await db.feature.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    include: {
      userStories: {
        where: { deletedAt: null },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          updatedAt: true,
        },
      },
    },
  });
  if (!feature) notFound();

  const status = deriveFeatureStatus(
    feature.userStories.map((story) => story.status),
  );

  return (
    <div className="page-shell">
      <PageHeader
        title={feature.name}
        description={feature.summary}
        meta={
          <>
            <Tag>FE</Tag>
            <span className="page-code">{feature.code}</span>
            <RequirementStatusBadge status={status} />
          </>
        }
        actions={
          <RequirementDetailActions
            type="FEATURE"
            id={feature.id}
            childCount={feature.userStories.length}
          />
        }
      />

      <div className="detail-sections">
        <PageSection title="业务背景与目标">
          <MarkdownView content={feature.backgroundGoal} />
        </PageSection>

        <PageSection
          title="US"
          actions={
            <span className="text-sm text-slate-500">
              共 {feature.userStories.length} 个
            </span>
          }
          contentClassName="!p-0"
        >
          <FeatureChildrenTable
            items={feature.userStories.map((story) => ({
              ...story,
              updatedAt: story.updatedAt.toISOString(),
            }))}
          />
        </PageSection>
      </div>
    </div>
  );
}
