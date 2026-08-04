import type { Metadata } from "next";

import { notFound } from "next/navigation";

import {
  UserStoryForm,
  type UserStoryFormValues,
} from "@/components/requirements/user-story-form";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "编辑 US",
};

export default async function EditUserStoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, project] = await Promise.all([params, getCurrentProject()]);
  if (!project) notFound();

  const story = await db.userStory.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    include: {
      feature: {
        select: { id: true, code: true, name: true },
      },
      acceptanceCriteria: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!story) notFound();

  const initialValues: UserStoryFormValues = {
    title: story.title,
    asA: story.asA,
    iWant: story.iWant,
    soThat: story.soThat,
    status: story.status,
    businessRules: story.businessRules ?? "",
    nonFunctionalRequirements: story.nonFunctionalRequirements ?? "",
    acceptanceCriteria: story.acceptanceCriteria.map((criterion) => ({
      id: criterion.id,
      given: criterion.given,
      when: criterion.when,
      then: criterion.then,
    })),
  };

  return (
    <UserStoryForm
      userStoryId={story.id}
      currentVersion={story.currentVersion}
      code={story.code}
      feature={story.feature}
      initialValues={initialValues}
    />
  );
}
