import type { Metadata } from "next";

import { ConsistencyCheckForm } from "@/components/requirements/consistency-check-form";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
import { ProjectRequiredState } from "@/components/projects/project-required-state";
import { RequirementStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = { title: "一致性检查" };

export default async function NewConsistencyCheckPage() {
  const project = await getCurrentProject();
  if (!project) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <PageHeader title="一致性检查" description="请先创建项目。" />
        <ProjectRequiredState />
      </PageContainer>
    );
  }

  const [
    repositories,
    userStoryCount,
    requirementCaseCount,
    platformCaseCount,
  ] = await Promise.all([
    db.repository.findMany({
      where: { projectId: project.id, deletedAt: null },
      orderBy: { position: "asc" },
      select: { id: true, gitUrl: true, branch: true },
    }),
    db.userStory.count({
      where: {
        projectId: project.id,
        status: {
          in: [RequirementStatus.TESTING, RequirementStatus.COMPLETED],
        },
        deletedAt: null,
      },
    }),
    db.testCase.count({
      where: {
        projectId: project.id,
        enabled: true,
        deletedAt: null,
        userStory: {
          status: {
            in: [RequirementStatus.TESTING, RequirementStatus.COMPLETED],
          },
          deletedAt: null,
        },
      },
    }),
    db.testCase.count({
      where: {
        projectId: project.id,
        userStoryId: null,
        enabled: true,
        deletedAt: null,
      },
    }),
  ]);
  const disabled =
    repositories.length === 0 || userStoryCount + platformCaseCount === 0;

  return (
    <PageContainer className="flex flex-col gap-5">
      <PageHeader
        title="一致性检查"
        description="以配置分支的最新代码为依据，检查正式需求与测试用例是否需要更新。"
        actions={<ConsistencyCheckForm disabled={disabled} />}
      />
      <PageSection title="检查范围">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="bg-muted/40 rounded-lg p-4">
            <dt className="text-muted-foreground text-sm">测试/完成态 US</dt>
            <dd className="mt-1 text-2xl font-semibold">{userStoryCount}</dd>
          </div>
          <div className="bg-muted/40 rounded-lg p-4">
            <dt className="text-muted-foreground text-sm">启用的需求用例</dt>
            <dd className="mt-1 text-2xl font-semibold">
              {requirementCaseCount}
            </dd>
          </div>
          <div className="bg-muted/40 rounded-lg p-4">
            <dt className="text-muted-foreground text-sm">启用的平台用例</dt>
            <dd className="mt-1 text-2xl font-semibold">{platformCaseCount}</dd>
          </div>
        </dl>
      </PageSection>
      <PageSection title="代码快照">
        {repositories.length ? (
          <div className="divide-border divide-y rounded-lg border">
            {repositories.map((repository) => (
              <div
                key={repository.id}
                className="grid gap-1 px-4 py-3 sm:grid-cols-[1fr_auto]"
              >
                <span
                  className="truncate font-medium"
                  title={repository.gitUrl}
                >
                  {repository.gitUrl}
                </span>
                <span className="text-muted-foreground font-mono text-sm">
                  {repository.branch}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            请先在代码仓库设置中配置仓库和分支。
          </p>
        )}
      </PageSection>
    </PageContainer>
  );
}
