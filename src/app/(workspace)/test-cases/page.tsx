import type { Metadata } from "next";

import { Button, Empty } from "antd";

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
      <div className="page-shell">
        <div className="page-heading">
          <div>
            <h1 className="page-title">测试用例</h1>
            <p className="page-description">
              请先创建项目，再开始编写测试用例。
            </p>
          </div>
        </div>
        <div className="content-panel py-20">
          <Empty description="当前没有可用项目">
            <Button type="primary" href="/projects">
              创建项目
            </Button>
          </Empty>
        </div>
      </div>
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
      updatedAt: true,
      group: { select: { name: true } },
      _count: {
        select: { steps: { where: { deletedAt: null } } },
      },
      runs: {
        orderBy: { queuedAt: "desc" },
        take: 1,
        select: { status: true },
      },
    },
  });

  const items: TestCaseListItem[] = testCases.map((testCase) => ({
    id: testCase.id,
    code: testCase.code,
    name: testCase.name,
    groupName: testCase.group.name,
    priority: testCase.priority,
    enabled: testCase.enabled,
    hasScript: Boolean(testCase.script?.trim()),
    stepCount: testCase._count.steps,
    lastRunStatus: testCase.runs[0]?.status ?? null,
    updatedAt: testCase.updatedAt.toISOString(),
  }));

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <h1 className="page-title">测试用例</h1>
          <p className="page-description">
            使用自然语言步骤验证需求，也可以为用例编写 Playwright TypeScript
            脚本。
          </p>
        </div>
      </div>
      <TestCasesList
        items={items}
        total={total}
        groups={groups}
        filters={{
          q: params.q ?? "",
          group: params.group ?? "",
          priority: priority ?? "",
          enabled: params.enabled ?? "",
          page: safePage,
        }}
      />
    </div>
  );
}
