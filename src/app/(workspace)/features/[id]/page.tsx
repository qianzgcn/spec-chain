import type { Metadata } from "next";

import { Tag } from "antd";
import { notFound } from "next/navigation";

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
      <div className="page-heading">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <Tag color="geekblue">FE</Tag>
            <span className="font-mono text-xs text-slate-500">
              {feature.code}
            </span>
            <RequirementStatusBadge status={status} />
          </div>
          <h1 className="page-title">{feature.name}</h1>
          <p className="page-description">{feature.summary}</p>
        </div>
        <RequirementDetailActions
          type="FEATURE"
          id={feature.id}
          childCount={feature.userStories.length}
        />
      </div>

      <div className="content-panel max-w-[1180px]">
        <section className="border-b border-slate-200 px-7 py-6">
          <h2 className="mb-4 text-base font-semibold text-slate-800">
            业务背景与目标
          </h2>
          <MarkdownView content={feature.backgroundGoal} />
        </section>

        <section>
          <div className="flex items-center justify-between border-b border-slate-200 px-7 py-5">
            <div>
              <h2 className="m-0 text-base font-semibold text-slate-800">US</h2>
              <p className="mt-1 mb-0 text-sm text-slate-500">
                FE 状态取全部未删除关联 US 中进度最慢的状态；没有关联 US
                时为设计。
              </p>
            </div>
            <span className="text-sm text-slate-500">
              共 {feature.userStories.length} 个
            </span>
          </div>
          <FeatureChildrenTable
            items={feature.userStories.map((story) => ({
              ...story,
              updatedAt: story.updatedAt.toISOString(),
            }))}
          />
        </section>
      </div>
    </div>
  );
}
