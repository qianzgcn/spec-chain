import type { Metadata } from "next";

import { Button, Empty } from "antd";

import { UserStoryForm } from "@/components/requirements/user-story-form";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "新建独立 US",
};

export default async function NewIndependentUserStoryPage() {
  const currentProject = await getCurrentProject();
  if (!currentProject) {
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

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <h1 className="page-title">新建独立 US</h1>
          <p className="page-description">
            用于不需要 FE 拆分的小型完整需求，保存后不能再加入 FE。
          </p>
        </div>
      </div>
      <UserStoryForm feature={null} />
    </div>
  );
}
