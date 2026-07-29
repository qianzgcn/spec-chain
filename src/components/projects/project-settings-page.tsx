import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectRequiredState } from "@/components/projects/project-required-state";

export function ProjectSettingsPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <PageContainer className="flex flex-col gap-5">
      <PageHeader title={title} description={description} />
      {children}
    </PageContainer>
  );
}

export function NoCurrentProject() {
  return <ProjectRequiredState description="请先创建一个项目。" />;
}
