import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectRequiredState } from "@/components/projects/project-required-state";
import {
  TestCasesList,
  type TestCaseListItem,
} from "@/components/test-cases/test-cases-list";
import { TestPriority } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "测试用例",
};

type SearchParams = {
  q?: string;
  group?: string;
  priority?: string;
  enabled?: string;
  type?: string;
  page?: string;
};

export default async function TestCasesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [params, project] = await Promise.all([
    searchParams,
    getCurrentProject(),
  ]);

  if (!project) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <PageHeader
          title="测试用例"
          description="请先创建项目，再开始编写测试用例。"
        />
        <ProjectRequiredState />
      </PageContainer>
    );
  }

  const query = params.q?.trim() ?? "";
  const priority = Object.values(TestPriority).includes(
    params.priority as TestPriority,
  )
    ? (params.priority as TestPriority)
    : undefined;
  const enabled =
    params.enabled === "true"
      ? true
      : params.enabled === "false"
        ? false
        : undefined;
  const type =
    params.type === "REQUIREMENT" || params.type === "PLATFORM"
      ? params.type
      : undefined;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const where = {
    projectId: project.id,
    deletedAt: null,
    ...(query
      ? {
          OR: [{ code: { contains: query } }, { name: { contains: query } }],
        }
      : {}),
    ...(params.group ? { groupId: params.group } : {}),
    ...(priority ? { priority } : {}),
    ...(enabled === undefined ? {} : { enabled }),
    ...(type === "REQUIREMENT"
      ? { userStoryId: { not: null } }
      : type === "PLATFORM"
        ? { userStoryId: null }
        : {}),
  };

  const [groups, total] = await Promise.all([
    db.testCaseGroup.findMany({
      where: { projectId: project.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.testCase.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / 20));
  const safePage = Math.min(page, pageCount);
  const testCases = await db.testCase.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip: (safePage - 1) * 20,
    take: 20,
    select: {
      id: true,
      code: true,
      name: true,
      priority: true,
      enabled: true,
      script: true,
      userStory: { select: { id: true, code: true } },
      updatedAt: true,
      group: { select: { name: true } },
      runs: {
        where: { deletedAt: null },
        orderBy: { queuedAt: "desc" },
        take: 1,
        select: {
          status: true,
          stage: true,
          queuedAt: true,
          startedAt: true,
          finishedAt: true,
        },
      },
    },
  });

  const items: TestCaseListItem[] = testCases.map((testCase) => {
    const lastRun = testCase.runs[0];
    const lastRunAt = lastRun
      ? (lastRun.finishedAt ?? lastRun.startedAt ?? lastRun.queuedAt)
      : null;

    return {
      id: testCase.id,
      code: testCase.code,
      name: testCase.name,
      groupName: testCase.group.name,
      priority: testCase.priority,
      enabled: testCase.enabled,
      hasScript: Boolean(testCase.script?.trim()),
      type: testCase.userStory ? "REQUIREMENT" : "PLATFORM",
      userStory: testCase.userStory,
      lastRunStatus: lastRun?.status ?? null,
      lastRunStage: lastRun?.stage ?? null,
      lastEditedAt: testCase.updatedAt.toISOString(),
      lastRunAt: lastRunAt?.toISOString() ?? null,
    };
  });

  return (
    <PageContainer table className="gap-5">
      <PageHeader
        title="测试用例"
        description="使用自然语言步骤验证需求，也可以为用例编写 Playwright TypeScript 脚本。"
      />
      <TestCasesList
        items={items}
        total={total}
        groups={groups}
        filters={{
          q: params.q ?? "",
          group: params.group ?? "",
          priority: priority ?? "",
          enabled: params.enabled ?? "",
          type: type ?? "",
          page: safePage,
        }}
      />
    </PageContainer>
  );
}
