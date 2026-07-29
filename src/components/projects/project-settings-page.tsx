import { Button, Empty } from "antd";

import { PageHeader } from "@/components/layout/page-header";

export function ProjectSettingsPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="page-shell">
      <PageHeader title={title} description={description} />
      {children}
    </div>
  );
}

export function NoCurrentProject() {
  return (
    <div className="content-panel empty-panel">
      <Empty description="请先创建一个项目">
        <Button type="primary" href="/projects">
          前往项目管理
        </Button>
      </Empty>
    </div>
  );
}
