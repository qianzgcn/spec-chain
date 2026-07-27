import type { Metadata } from "next";

import ThunderboltOutlined from "@ant-design/icons/ThunderboltOutlined";
import { Button, Empty } from "antd";

import { UserStoryForm } from "@/components/requirements/user-story-form";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "新建US",
};

export default async function NewIndependentUserStoryPage() {
  const currentProject = await getCurrentProject();
  if (!currentProject) {
    return (
      <div className="page-shell">
        <div className="page-heading">
          <div>
            <h1 className="page-title">新建US</h1>
            <p className="page-description">请先创建项目，再开始编写需求。</p>
          </div>
        </div>
        <div className="content-panel empty-panel">
          <Empty description="请先创建项目">
            <Button type="primary" href="/projects">
              前往项目管理
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
          <h1 className="page-title">新建US</h1>
          <p className="page-description">
            编写边界清楚、可开发、可验证的用户故事。
          </p>
        </div>
        <Button icon={<ThunderboltOutlined />} href="/user-stories/ai-generate">
          AI辅助生成US
        </Button>
      </div>
      <UserStoryForm feature={null} />
    </div>
  );
}
