import type { Metadata } from "next";

import ThunderboltOutlined from "@ant-design/icons/ThunderboltOutlined";
import { Button } from "antd";
import { notFound } from "next/navigation";

import { UserStoryForm } from "@/components/requirements/user-story-form";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "新建US",
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
          <h1 className="page-title">新建US</h1>
          <p className="page-description">
            编写边界清楚、可开发、可验证的用户故事。
          </p>
        </div>
        <Button
          icon={<ThunderboltOutlined />}
          href={`/user-stories/ai-generate?featureId=${feature.id}`}
        >
          AI辅助生成US
        </Button>
      </div>
      <UserStoryForm feature={feature} />
    </div>
  );
}
