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
        description="配置测试环境、项目变量和自动化复用能力。"
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
      automationInstructions: true,
      loginMethodSource: true,
      variables: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: {
          id: true,
          name: true,
          value: true,
          description: true,
          kind: true,
          encrypted: true,
          fields: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              name: true,
              value: true,
              description: true,
              kind: true,
              encrypted: true,
            },
          },
        },
      },
    },
  });

  return (
    <ProjectTestingSettingsForm
      key={`${project.id}:${project.variables
        .map((variable) => variable.id)
        .join(",")}`}
      project={{
        id: project.id,
        baseUrl: project.baseUrl ?? "",
        automationInstructions: project.automationInstructions ?? "",
        loginMethodSource: project.loginMethodSource ?? "",
        variables: project.variables.map((variable) =>
          variable.kind === "OBJECT"
            ? {
                id: variable.id,
                name: variable.name,
                description: variable.description ?? "",
                kind: variable.kind,
                fields: variable.fields.map((field) => ({
                  id: field.id,
                  name: field.name,
                  value: field.encrypted ? "" : field.value,
                  description: field.description ?? "",
                  kind: field.kind,
                  encrypted: field.encrypted,
                })),
              }
            : {
                id: variable.id,
                name: variable.name,
                value: variable.encrypted ? "" : variable.value,
                description: variable.description ?? "",
                kind: variable.kind,
                encrypted: variable.encrypted,
              },
        ),
      }}
    />
  );
}
