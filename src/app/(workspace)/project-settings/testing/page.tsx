import type { Metadata } from "next";

import {
  NoCurrentProject,
  ProjectSettingsPage,
} from "@/components/projects/project-settings-page";
import { ProjectTestingSettingsForm } from "@/components/projects/project-testing-settings-form";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "测试设置",
};

export default async function ProjectTestingSettingsPage() {
  const currentProject = await getCurrentProject();

  if (!currentProject) {
    return (
      <ProjectSettingsPage
        title="测试设置"
        description="配置自动化测试访问地址和运行环境变量。"
      >
        <NoCurrentProject />
      </ProjectSettingsPage>
    );
  }

  const project = await db.project.findFirstOrThrow({
    where: { id: currentProject.id, deletedAt: null },
    select: {
      id: true,
      baseUrl: true,
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
    <ProjectSettingsPage
      title="测试设置"
      description="配置自动化测试访问地址和运行环境变量。"
    >
      <ProjectTestingSettingsForm
        key={`${project.id}:${project.variables
          .map((variable) => variable.id)
          .join(",")}`}
        project={{
          id: project.id,
          baseUrl: project.baseUrl ?? "",
          variables: project.variables.map((variable) => ({
            id: variable.id,
            name: variable.name,
            value: variable.kind === "SECRET" ? "" : variable.value,
            description: variable.description ?? "",
            kind: variable.kind,
          })),
        }}
      />
    </ProjectSettingsPage>
  );
}
