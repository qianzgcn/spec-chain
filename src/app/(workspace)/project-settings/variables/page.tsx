import type { Metadata } from "next";

import {
  NoCurrentProject,
  ProjectSettingsPage,
} from "@/components/projects/project-settings-page";
import { ProjectVariablesForm } from "@/components/projects/project-variables-form";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "项目变量",
};

export default async function ProjectVariablesPage() {
  const currentProject = await getCurrentProject();

  if (!currentProject) {
    return (
      <ProjectSettingsPage
        title="项目变量"
        description="管理自动化运行时注入的普通变量和敏感变量。"
      >
        <NoCurrentProject />
      </ProjectSettingsPage>
    );
  }

  const project = await db.project.findFirstOrThrow({
    where: { id: currentProject.id, deletedAt: null },
    select: {
      id: true,
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
      title="项目变量"
      description="管理自动化运行时注入的普通变量和敏感变量。"
    >
      <ProjectVariablesForm
        key={`${project.id}:${project.variables
          .map((variable) => variable.id)
          .join(",")}`}
        project={{
          id: project.id,
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
