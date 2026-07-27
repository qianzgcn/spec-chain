import type { Metadata } from "next";

import { Button, Empty } from "antd";

import { TestCaseForm } from "@/components/test-cases/test-case-form";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "新建测试用例",
};

export default async function NewTestCasePage() {
  const project = await getCurrentProject();
  if (!project) {
    return (
      <div className="page-shell">
        <Empty description="请先创建项目">
          <Button type="primary" href="/projects">
            前往项目管理
          </Button>
        </Empty>
      </div>
    );
  }

  const [groups, userStories] = await Promise.all([
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

  if (groups.length === 0) {
    return (
      <div className="page-shell">
        <div className="page-heading">
          <div>
            <h1 className="page-title">新建测试用例</h1>
            <p className="page-description">
              测试用例必须属于一个分组，请先创建分组。
            </p>
          </div>
        </div>
        <div className="content-panel py-20">
          <Empty description="当前项目还没有用例分组">
            <Button type="primary" href="/test-case-groups">
              创建用例分组
            </Button>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <h1 className="page-title">新建测试用例</h1>
          <p className="page-description">
            先写清操作步骤与预期结果；自动化脚本可以稍后补充。
          </p>
        </div>
      </div>
      <TestCaseForm
        groups={groups}
        userStories={userStories.map((story) => ({
          id: story.id,
          code: story.code,
          title: story.title,
          featureName: story.feature?.name ?? null,
        }))}
      />
    </div>
  );
}
