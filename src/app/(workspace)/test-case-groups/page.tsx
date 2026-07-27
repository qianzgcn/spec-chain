import type { Metadata } from "next";

import { Button, Empty } from "antd";

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
      <div className="page-shell">
        <div className="page-heading">
          <div>
            <h1 className="page-title">用例分组</h1>
            <p className="page-description">请先创建项目，再配置用例分组。</p>
          </div>
        </div>
        <div className="content-panel empty-panel">
          <Empty description="当前没有可用项目">
            <Button type="primary" href="/projects">
              创建项目
            </Button>
          </Empty>
        </div>
      </div>
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
    <div className="page-shell page-shell--table">
      <div className="page-heading">
        <div>
          <h1 className="page-title">用例分组</h1>
          <p className="page-description">
            分组用于组织测试用例，创建用例时必须选择一个分组。
          </p>
        </div>
      </div>
      <TestCaseGroupsManagement
        groups={groups.map((group) => ({
          id: group.id,
          name: group.name,
          testCaseCount: group._count.testCases,
          updatedAt: group.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
