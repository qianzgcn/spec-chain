import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectRequiredState } from "@/components/projects/project-required-state";
import { FeatureForm } from "@/components/requirements/feature-form";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = {
  title: "新建 FE",
};

export default async function NewFeaturePage() {
  const currentProject = await getCurrentProject();

  if (!currentProject) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <PageHeader
          title="新建 FE"
          description="请先创建项目，再开始编写需求。"
        />
        <ProjectRequiredState />
      </PageContainer>
    );
  }

  return <FeatureForm />;
}
