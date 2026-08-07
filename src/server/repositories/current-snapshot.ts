import "server-only";

import { resolveProjectRepositories } from "@/ai/repository-access";
import { createRepositoryCodeSource } from "@/ai/repository-code-source";
import { loadRepositorySnapshots } from "@/ai/relevant-code";
import { decryptAesGcm } from "@/lib/security/aes-gcm";
import { db } from "@/server/db";
import { env } from "@/server/env";

export async function loadCurrentRepositorySnapshot(projectId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      githubPatEncrypted: true,
      giteePatEncrypted: true,
      repositories: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: { id: true, gitUrl: true, branch: true },
      },
    },
  });
  if (!project) throw new Error("项目不存在或已删除");

  const repositories = resolveProjectRepositories(project, (encrypted) =>
    decryptAesGcm(encrypted, env.ENCRYPTION_KEY),
  );
  const snapshots = await loadRepositorySnapshots({
    repositories,
    repositoryCodeSource: createRepositoryCodeSource(),
  });
  return snapshots.map((snapshot) => ({
    repositoryId: snapshot.repositoryId,
    provider: snapshot.provider,
    owner: snapshot.owner,
    repository: snapshot.repository,
    branch: snapshot.branch,
    commitSha: snapshot.commitSha,
  }));
}
