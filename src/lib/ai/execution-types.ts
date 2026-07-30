import {
  AiCapability,
  AiDraftStatus,
  AiExecutionLogLevel,
  AiExecutionStage,
  AiExecutionStatus,
} from "@/generated/prisma/enums";

export type AiExecutionUserStoryResult = {
  kind: "USER_STORY";
  id: string;
  status: AiDraftStatus;
  deleted: boolean;
  confirmedUserStoryId: string | null;
};

export type AiExecutionTestCaseResult = {
  kind: "TEST_CASE_BATCH";
  id: string;
  deleted: boolean;
  pendingCount: number;
  confirmedCount: number;
};

export type AiExecutionResult =
  AiExecutionUserStoryResult | AiExecutionTestCaseResult;

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
  sourceUserStory: {
    code: string;
    title: string;
    deleted: boolean;
  } | null;
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
  result: AiExecutionResult | null;
  logs: AiExecutionLogEntry[];
};
