import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { UserStoryForm } from "@/components/requirements/user-story-form";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "新建子 US",
};

export default async function NewFeatureUserStoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, project] = await Promise.all([params, getCurrentProject()]);
  if (!project) notFound();

  const feature = await db.feature.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: { id: true, code: true, name: true },
  });
  if (!feature) notFound();

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <h1 className="page-title">新建子 US</h1>
          <p className="page-description">
            将复杂需求拆分为边界清楚、可独立验证的用户故事。
          </p>
        </div>
      </div>
      <UserStoryForm feature={feature} />
    </div>
  );
}
