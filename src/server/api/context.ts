import "server-only";

import { cookies } from "next/headers";

import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { CURRENT_PROJECT_COOKIE } from "@/server/projects/current-project";

export async function getAuthenticatedApiContext() {
  const user = await getCurrentUser();
  if (!user) return null;

  const selectedProjectId = (await cookies()).get(
    CURRENT_PROJECT_COOKIE,
  )?.value;
  const selectedProject = selectedProjectId
    ? await db.project.findFirst({
        where: { id: selectedProjectId, deletedAt: null },
        select: { id: true, name: true, baseUrl: true },
      })
    : null;

  const project =
    selectedProject ??
    (await db.project.findFirst({
      where: { deletedAt: null },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      select: { id: true, name: true, baseUrl: true },
    }));

  return { user, project };
}
