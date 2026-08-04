import { AiWorkflowError } from "@/ai/workflow";
import type { RepositoryAccess } from "@/ai/repository-code-source";
import {
  GIT_PROVIDER_LABELS,
  parseRepositoryUrl,
} from "@/lib/git/repository-url";

export type ProjectRepositorySettings = {
  githubPatEncrypted: string | null;
  giteePatEncrypted: string | null;
  repositories: readonly {
    id: string;
    gitUrl: string;
    branch: string;
  }[];
};

export function resolveProjectRepositories(
  project: ProjectRepositorySettings,
  decryptSecret: (encrypted: string) => string,
): RepositoryAccess[] {
  if (project.repositories.length === 0) {
    throw new AiWorkflowError("当前项目尚未配置代码仓库");
  }

  return project.repositories.map((repository) => {
    const location = parseRepositoryUrl(repository.gitUrl);
    const encryptedPat =
      location.provider === "GITHUB"
        ? project.githubPatEncrypted
        : project.giteePatEncrypted;

    if (!encryptedPat) {
      throw new AiWorkflowError(
        `当前项目尚未配置 ${GIT_PROVIDER_LABELS[location.provider]} PAT`,
      );
    }

    try {
      return { ...repository, pat: decryptSecret(encryptedPat) };
    } catch {
      throw new AiWorkflowError(
        `${GIT_PROVIDER_LABELS[location.provider]} PAT 无法读取，请删除后重新新增`,
      );
    }
  });
}
