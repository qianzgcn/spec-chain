import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { FeatureForm } from "@/components/requirements/feature-form";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "编辑 FE",
};

export default async function EditFeaturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, project] = await Promise.all([params, getCurrentProject()]);
  if (!project) notFound();

  const feature = await db.feature.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
  });
  if (!feature) notFound();

  return (
    <FeatureForm
      featureId={feature.id}
      code={feature.code}
      initialValues={{
        name: feature.name,
        summary: feature.summary,
        backgroundGoal: feature.backgroundGoal,
      }}
    />
  );
}
