import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { DeliveryVersionForm } from "@/components/delivery-versions/delivery-version-form";
import { DeliveryVersionStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";

export const metadata: Metadata = { title: "编辑交付版本" };

export default async function EditDeliveryVersionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, project] = await Promise.all([params, getCurrentProject()]);
  if (!project) notFound();

  const version = await db.deliveryVersion.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      status: true,
      lockedAt: true,
      updatedAt: true,
      currentForProject: { select: { id: true } },
    },
  });
  if (!version || version.status === DeliveryVersionStatus.DELIVERED) {
    notFound();
  }

  return (
    <DeliveryVersionForm
      id={version.id}
      code={version.code}
      expectedUpdatedAt={version.updatedAt.toISOString()}
      canSetCurrent={!version.lockedAt && !version.currentForProject}
      initialValues={{
        name: version.name,
        description: version.description ?? "",
        setCurrent: Boolean(version.currentForProject),
      }}
    />
  );
}
