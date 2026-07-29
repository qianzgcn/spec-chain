import type { Metadata } from "next";

import { ProjectManagement } from "@/components/projects/project-management";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "项目管理",
};

export default async function ProjectsPage() {
  await requireUser();

  const [projects, currentProject] = await Promise.all([
    db.project.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        baseUrl: true,
        updatedAt: true,
        _count: {
          select: {
            features: { where: { deletedAt: null } },
            userStories: { where: { deletedAt: null } },
            testCases: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    getCurrentProject(),
  ]);

  return (
    <div className="page-shell page-shell--table">
      <PageHeader
        title="项目管理"
        description="需求和测试用例始终归属于一个项目；有业务数据的项目不能删除。"
      />

      <ProjectManagement
        currentProjectId={currentProject?.id ?? null}
        projects={projects.map((project) => ({
          ...project,
          updatedAt: project.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
