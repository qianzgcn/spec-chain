import type { Metadata } from "next";

import {
  NoCurrentProject,
  ProjectSettingsPage,
} from "@/components/projects/project-settings-page";
import { ProjectAuthenticationForm } from "@/components/projects/project-authentication-form";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "登录配置",
};

export default async function ProjectAuthenticationPage() {
  const currentProject = await getCurrentProject();
  if (!currentProject) {
    return (
      <ProjectSettingsPage
        title="登录配置"
        description="维护项目统一的页面登录方法和可复用登录身份。"
      >
        <NoCurrentProject />
      </ProjectSettingsPage>
    );
  }

  const project = await db.project.findFirstOrThrow({
    where: { id: currentProject.id, deletedAt: null },
    select: {
      id: true,
      loginMethodSource: true,
      variables: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: { id: true, name: true, kind: true },
      },
      loginProfiles: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          usernameVariableId: true,
          passwordVariableId: true,
        },
      },
    },
  });

  return (
    <ProjectAuthenticationForm
      project={{
        id: project.id,
        loginMethodSource: project.loginMethodSource ?? "",
        profiles: project.loginProfiles,
      }}
      variables={project.variables}
    />
  );
}
