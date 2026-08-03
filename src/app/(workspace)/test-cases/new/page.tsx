import type { Metadata } from "next";

import { LayersIcon } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/navigation/button-link";
import { ProjectRequiredState } from "@/components/projects/project-required-state";
import { TestCaseForm } from "@/components/test-cases/test-case-form";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "新建测试用例",
};

export default async function NewTestCasePage() {
  const project = await getCurrentProject();
  if (!project) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <PageHeader
          title="新建测试用例"
          description="请先创建项目，再开始编写测试用例。"
        />
        <ProjectRequiredState />
      </PageContainer>
    );
  }

  const [groups, userStories, loginProfiles] = await Promise.all([
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
    db.projectLoginProfile.findMany({
      where: { projectId: project.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (groups.length === 0) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <PageHeader
          title="新建测试用例"
          description="测试用例必须属于一个分组，请先创建分组。"
        />
        <div className="bg-card grid min-h-72 place-items-center rounded-lg border">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LayersIcon />
              </EmptyMedia>
              <EmptyTitle>当前项目还没有用例分组</EmptyTitle>
              <EmptyDescription>
                创建至少一个分组后，即可开始编写测试用例。
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <ButtonLink href="/test-case-groups">创建用例分组</ButtonLink>
            </EmptyContent>
          </Empty>
        </div>
      </PageContainer>
    );
  }

  return (
    <TestCaseForm
      groups={groups}
      userStories={userStories.map((story) => ({
        id: story.id,
        code: story.code,
        title: story.title,
        featureName: story.feature?.name ?? null,
      }))}
      loginProfiles={loginProfiles}
    />
  );
}
