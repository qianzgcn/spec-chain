import type { Metadata } from "next";

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

  return <UserStoryForm feature={feature} />;
}
