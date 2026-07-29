import type { Metadata } from "next";

import { Button, Empty } from "antd";

import { FeatureForm } from "@/components/requirements/feature-form";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "新建 FE",
};

export default async function NewFeaturePage() {
  const currentProject = await getCurrentProject();

  if (!currentProject) {
    return (
      <div className="page-shell">
        <div className="page-heading">
          <div>
            <h1 className="page-title">新建 FE</h1>
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

  return <FeatureForm />;
}
