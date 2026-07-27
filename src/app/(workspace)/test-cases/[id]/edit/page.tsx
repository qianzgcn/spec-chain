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
        userStoryLinks: {
          where: {
            deletedAt: null,
            userStory: { deletedAt: null },
          },
          select: { userStoryId: true },
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
    userStoryIds: testCase.userStoryLinks.map((link) => link.userStoryId),
  };

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <h1 className="page-title">编辑测试用例</h1>
          <p className="page-description">{testCase.code}</p>
        </div>
      </div>
      <TestCaseForm
        testCaseId={testCase.id}
        groups={groups}
        userStories={userStories.map((story) => ({
          id: story.id,
          code: story.code,
          title: story.title,
          featureName: story.feature?.name ?? null,
        }))}
        initialValues={initialValues}
      />
    </div>
  );
}
