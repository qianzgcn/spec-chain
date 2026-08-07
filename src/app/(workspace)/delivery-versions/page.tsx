import type { Metadata } from "next";

import {
  DeliveryVersionsList,
  type DeliveryVersionListItem,
} from "@/components/delivery-versions/delivery-versions-list";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/navigation/button-link";
import { ProjectRequiredState } from "@/components/projects/project-required-state";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = { title: "交付版本" };

export default async function DeliveryVersionsPage() {
  const project = await getCurrentProject();
  if (!project) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <PageHeader title="交付版本" />
        <ProjectRequiredState />
      </PageContainer>
    );
  }

  const versions = await db.deliveryVersion.findMany({
    where: { projectId: project.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      lockedAt: true,
      updatedAt: true,
      currentForProject: { select: { id: true } },
      _count: { select: { userStories: { where: { deletedAt: null } } } },
    },
  });
  const items: DeliveryVersionListItem[] = versions.map((version) => ({
    id: version.id,
    code: version.code,
    name: version.name,
    status: version.status,
    locked: Boolean(version.lockedAt),
    current: Boolean(version.currentForProject),
    userStoryCount: version._count.userStories,
    updatedAt: version.updatedAt.toISOString(),
  }));

  return (
    <PageContainer table className="gap-5">
      <PageHeader
        title="交付版本"
        description="按交付范围锁定需求基线，并集中查看实现审查和自动化验证结果。"
        actions={
          <ButtonLink href="/delivery-versions/new">新建交付版本</ButtonLink>
        }
      />
      <DeliveryVersionsList items={items} />
    </PageContainer>
  );
}
