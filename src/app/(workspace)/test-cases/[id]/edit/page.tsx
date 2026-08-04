import type { Metadata } from "next";

import { notFound } from "next/navigation";

import {
  TestCaseForm,
  type TestCaseFormValues,
} from "@/components/test-cases/test-case-form";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "编辑测试用例",
};

export default async function EditTestCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, project] = await Promise.all([params, getCurrentProject()]);
  if (!project) notFound();

  const [testCase, groups, userStories] = await Promise.all([
    db.testCase.findFirst({
      where: { id, projectId: project.id, deletedAt: null },
      include: {
        userStory: {
          select: {
            id: true,
            code: true,
            title: true,
            deletedAt: true,
            feature: { select: { name: true } },
          },
        },
      },
    }),
    db.testCaseGroup.findMany({
      where: { projectId: project.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.userStory.findMany({
      where: { projectId: project.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        code: true,
        title: true,
        feature: { select: { name: true } },
      },
    }),
  ]);
  if (!testCase) notFound();

  const initialValues: TestCaseFormValues = {
    name: testCase.name,
    groupId: testCase.groupId,
    priority: testCase.priority,
    preconditions: testCase.preconditions ?? "",
    enabled: testCase.enabled,
    script: testCase.script ?? "",
    steps: testCase.steps,
    userStoryId: testCase.userStoryId,
  };
  const selectableStories = userStories.map((story) => ({
    id: story.id,
    code: story.code,
    title: story.title,
    featureName: story.feature?.name ?? null,
    deleted: false,
  }));
  if (
    testCase.userStory?.deletedAt &&
    !selectableStories.some((story) => story.id === testCase.userStory?.id)
  ) {
    selectableStories.push({
      id: testCase.userStory.id,
      code: testCase.userStory.code,
      title: testCase.userStory.title,
      featureName: testCase.userStory.feature?.name ?? null,
      deleted: true,
    });
  }

  return (
    <TestCaseForm
      testCaseId={testCase.id}
      currentVersion={testCase.currentVersion}
      code={testCase.code}
      groups={groups}
      userStories={selectableStories}
      initialValues={initialValues}
    />
  );
}
