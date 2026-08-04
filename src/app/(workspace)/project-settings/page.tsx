import type { Metadata } from "next";

import { ProjectBasicSettingsForm } from "@/components/projects/project-basic-settings-form";
import {
  NoCurrentProject,
  ProjectSettingsPage,
} from "@/components/projects/project-settings-page";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "基本信息",
};

export default async function ProjectBasicSettingsPage() {
  const currentProject = await getCurrentProject();

  if (!currentProject) {
    return (
      <ProjectSettingsPage
        title="基本信息"
        description="维护当前项目的名称和业务说明。"
      >
        <NoCurrentProject />
      </ProjectSettingsPage>
    );
  }

  const project = await db.project.findFirstOrThrow({
    where: { id: currentProject.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
    },
  });

  return (
    <ProjectBasicSettingsForm
      key={project.id}
      project={{
        id: project.id,
        name: project.name,
        description: project.description ?? "",
      }}
    />
  );
}
