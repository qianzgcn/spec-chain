import {
  AiDraftStatus,
  AiExecutionStage,
  AiExecutionStatus,
} from "@/generated/prisma/enums";

export type AiExecutionDraftSummary = {
  id: string;
  status: AiDraftStatus;
  deleted: boolean;
  confirmedUserStoryId: string | null;
};

export type AiExecutionSummary = {
  id: string;
  status: AiExecutionStatus;
  stage: AiExecutionStage;
  requirementText: string;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  requestedBy: string;
  feature: { code: string; name: string } | null;
  draft: AiExecutionDraftSummary | null;
};

export type AiRepositorySnapshot = {
  repositoryId: string;
  provider: "GITHUB" | "GITEE";
  owner: string;
  repository: string;
  branch: string;
  commitSha: string;
};

export type AiCodeReference = AiRepositorySnapshot & {
  path: string;
  reason: string;
};

export type AiExecutionDetail = AiExecutionSummary & {
  modelProfileNameSnapshot: string | null;
  modelIdSnapshot: string | null;
  skillNameSnapshot: string | null;
  skillVersionSnapshot: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  repositories: AiRepositorySnapshot[];
  codeReferences: AiCodeReference[];
};
