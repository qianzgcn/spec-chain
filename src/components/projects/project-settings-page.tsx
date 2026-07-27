import { Button, Empty } from "antd";

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
      <div className="page-heading">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-description">{description}</p>
        </div>
      </div>
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
