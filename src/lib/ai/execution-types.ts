import {
  AiCapability,
  AiDraftStatus,
  AiExecutionLogLevel,
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
  capability: AiCapability;
  status: AiExecutionStatus;
  stage: AiExecutionStage;
  requirementText: string;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  requestedBy: string;
  feature: { code: string; name: string } | null;
};

export type AiExecutionLogEntry = {
  position: number;
  level: AiExecutionLogLevel;
  stage: AiExecutionStage | null;
  message: string;
  createdAt: string;
};

export type AiExecutionDetail = AiExecutionSummary & {
  errorMessage: string | null;
  modelProfileNameSnapshot: string | null;
  modelIdSnapshot: string | null;
  skillNameSnapshot: string | null;
  skillVersionSnapshot: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  result: AiExecutionDraftSummary | null;
  logs: AiExecutionLogEntry[];
};
