import type { Metadata } from "next";

import {
  NoCurrentProject,
  ProjectSettingsPage,
} from "@/components/projects/project-settings-page";
import { ProjectRepositoriesForm } from "@/components/projects/project-repositories-form";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "代码仓库",
};

export default async function ProjectRepositoriesPage() {
  const currentProject = await getCurrentProject();

  if (!currentProject) {
    return (
      <ProjectSettingsPage
        title="代码仓库"
        description="管理项目级仓库凭据、代码仓库和连接检查。"
      >
        <NoCurrentProject />
      </ProjectSettingsPage>
    );
  }

  const project = await db.project.findFirstOrThrow({
    where: { id: currentProject.id, deletedAt: null },
    select: {
      id: true,
      githubPatEncrypted: true,
      githubPatAccount: true,
      giteePatEncrypted: true,
      giteePatAccount: true,
      repositories: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: { id: true, gitUrl: true, branch: true },
      },
    },
  });

  return (
    <ProjectRepositoriesForm
      key={`${project.id}:${project.repositories
        .map((repository) => repository.id)
        .join(",")}`}
      project={{
        id: project.id,
        hasGithubPat: Boolean(project.githubPatEncrypted),
        githubPatAccount: project.githubPatAccount,
        hasGiteePat: Boolean(project.giteePatEncrypted),
        giteePatAccount: project.giteePatAccount,
        repositories: project.repositories,
      }}
    />
  );
}
