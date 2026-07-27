import type { Metadata } from "next";

import { Button, Empty } from "antd";

import { ProjectSettingsForm } from "@/components/projects/project-settings-form";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "项目设置",
};

export default async function ProjectSettingsPage() {
  const currentProject = await getCurrentProject();

  if (!currentProject) {
    return (
      <div className="page-shell">
        <div className="content-panel py-20">
          <Empty description="请先创建一个项目">
            <Button type="primary" href="/projects">
              前往项目管理
            </Button>
          </Empty>
        </div>
      </div>
    );
  }

  const project = await db.project.findFirstOrThrow({
    where: { id: currentProject.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      baseUrl: true,
      repositories: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: { id: true, gitUrl: true, branch: true },
      },
      variables: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: {
          id: true,
          name: true,
          value: true,
          description: true,
          kind: true,
        },
      },
    },
  });

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <h1 className="page-title">项目设置</h1>
          <p className="page-description">
            配置当前项目的基础地址、代码仓库和自动化运行变量。
          </p>
        </div>
      </div>

      <ProjectSettingsForm
        project={{
          id: project.id,
          name: project.name,
          description: project.description ?? "",
          baseUrl: project.baseUrl ?? "",
          repositories: project.repositories.map((repository) => ({
            id: repository.id,
            gitUrl: repository.gitUrl,
            branch: repository.branch,
          })),
          variables: project.variables.map((variable) => ({
            id: variable.id,
            name: variable.name,
            value: variable.kind === "SECRET" ? "" : variable.value,
            description: variable.description ?? "",
            kind: variable.kind,
          })),
        }}
      />
    </div>
  );
}
