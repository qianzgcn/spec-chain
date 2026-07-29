import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { AiUserStoryGeneratorForm } from "@/components/ai/ai-user-story-generator-form";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "AI辅助生成US",
};

export default async function AiGenerateUserStoryPage({
  searchParams,
}: {
  searchParams: Promise<{ featureId?: string }>;
}) {
  const [project, { featureId }] = await Promise.all([
    getCurrentProject(),
    searchParams,
  ]);
  if (!project) notFound();

  const feature = featureId
    ? await db.feature.findFirst({
        where: {
          id: featureId,
          projectId: project.id,
          deletedAt: null,
        },
        select: { id: true, code: true, name: true },
      })
    : null;
  if (featureId && !feature) notFound();

  return <AiUserStoryGeneratorForm feature={feature} />;
}
