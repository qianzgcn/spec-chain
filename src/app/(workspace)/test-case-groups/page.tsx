import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectRequiredState } from "@/components/projects/project-required-state";
import { TestCaseGroupsManagement } from "@/components/test-cases/test-case-groups-management";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "用例分组",
};

export default async function TestCaseGroupsPage() {
  const project = await getCurrentProject();
  if (!project) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <PageHeader
          title="用例分组"
          description="请先创建项目，再配置用例分组。"
        />
        <ProjectRequiredState />
      </PageContainer>
    );
  }

  const groups = await db.testCaseGroup.findMany({
    where: { projectId: project.id, deletedAt: null },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      updatedAt: true,
      _count: {
        select: { testCases: { where: { deletedAt: null } } },
      },
    },
  });

  return (
    <PageContainer table className="gap-5">
      <PageHeader
        title="用例分组"
        description="分组用于组织测试用例，创建用例时必须选择一个分组。"
      />
      <TestCaseGroupsManagement
        groups={groups.map((group) => ({
          id: group.id,
          name: group.name,
          testCaseCount: group._count.testCases,
          updatedAt: group.updatedAt.toISOString(),
        }))}
      />
    </PageContainer>
  );
}
