import { VersionSource } from "@/generated/prisma/enums";

export const VERSION_SOURCE_LABELS: Record<VersionSource, string> = {
  [VersionSource.MIGRATION]: "历史迁移",
  [VersionSource.MANUAL]: "人工编辑",
  [VersionSource.AI_GENERATION]: "AI 生成",
  [VersionSource.CONSISTENCY_CHECK]: "一致性检查",
};

export function formatVersionRepositorySnapshot(snapshot: string | null) {
  if (!snapshot) return "—";
  try {
    const repositories = JSON.parse(snapshot) as Array<{
      repository?: string;
      branch?: string;
      commitSha?: string;
    }>;
    const labels = repositories.flatMap((repository) =>
      repository.repository && repository.commitSha
        ? [`${repository.repository}@${repository.commitSha.slice(0, 8)}`]
        : [],
    );
    return labels.length ? labels.join("，") : "—";
  } catch {
    return "—";
  }
}
