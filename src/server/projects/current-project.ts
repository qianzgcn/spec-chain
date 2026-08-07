import "server-only";

import { cache } from "react";

import { cookies } from "next/headers";

import { db } from "@/server/db";
import { requireUser } from "@/server/auth/session";

export const CURRENT_PROJECT_COOKIE = "specchain_project";

export const getActiveProjects = cache(async () => {
  await requireUser();

  return db.project.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      baseUrl: true,
      currentDeliveryVersionId: true,
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
  });
});

export const getCurrentProject = cache(async () => {
  const projects = await getActiveProjects();

  if (projects.length === 0) {
    return null;
  }

  const selectedProjectId = (await cookies()).get(
    CURRENT_PROJECT_COOKIE,
  )?.value;

  return (
    projects.find((project) => project.id === selectedProjectId) ?? projects[0]
  );
});
