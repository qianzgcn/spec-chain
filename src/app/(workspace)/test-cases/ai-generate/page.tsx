import type { Metadata } from "next";

import { AiTestCaseGeneratorForm } from "@/components/ai/ai-test-case-generator-form";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectRequiredState } from "@/components/projects/project-required-state";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "AI辅助生成测试用例",
};

export default async function AiGenerateTestCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ userStoryId?: string }>;
}) {
  const params = await searchParams;
  const project = await getCurrentProject();
  if (!project) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <PageHeader
          title="AI辅助生成测试用例"
          description="请先创建项目，再开始生成测试用例。"
        />
        <ProjectRequiredState />
      </PageContainer>
    );
  }

  const userStories = await db.userStory.findMany({
    where: { projectId: project.id, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      code: true,
      title: true,
      feature: { select: { name: true } },
      _count: { select: { testCases: { where: { deletedAt: null } } } },
    },
  });

  return (
    <AiTestCaseGeneratorForm
      initialUserStoryId={params.userStoryId ?? null}
      userStories={userStories.map((story) => ({
        id: story.id,
        code: story.code,
        title: story.title,
        featureName: story.feature?.name ?? null,
        hasTestCases: story._count.testCases > 0,
      }))}
    />
  );
}
