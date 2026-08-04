import type {
  AiCapability,
  AiDraftStatus,
  AiExecutionLogLevel,
  AiExecutionStage,
} from "@/generated/prisma/enums";

export type ExecutionTaskType = AiCapability;

export type ExecutionTaskStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export type ExecutionTaskSummary = {
  id: string;
  type: ExecutionTaskType;
  status: ExecutionTaskStatus;
  stageLabel: string;
  content: string;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  requestedBy: string;
};

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

export type AiExecutionAutomationScriptResult = {
  kind: "AUTOMATION_SCRIPT";
  testCaseId: string;
  deleted: boolean;
};

export type AiExecutionConsistencyResult = {
  kind: "CONSISTENCY_CHECK";
  deleted: false;
  totalCount: number;
  unchangedCount: number;
  requirementDraftCount: number;
  testCaseCreateCount: number;
  testCaseUpdateCount: number;
  testCaseRetireCount: number;
  attentionCount: number;
  attentionItems: Array<{ label: string; reason: string }>;
};

export type AiExecutionResult =
  | AiExecutionUserStoryResult
  | AiExecutionTestCaseResult
  | AiExecutionAutomationScriptResult
  | AiExecutionConsistencyResult;

export type AiExecutionLogEntry = {
  position: number;
  level: AiExecutionLogLevel;
  stage: AiExecutionStage | null;
  message: string;
  createdAt: string;
};

type ExecutionTaskDetailBase = ExecutionTaskSummary & {
  errorMessage: string | null;
  modelProfileNameSnapshot: string | null;
  modelIdSnapshot: string | null;
  skillNameSnapshot: string | null;
  skillVersionSnapshot: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type AiExecutionTaskDetail = ExecutionTaskDetailBase & {
  capability: AiCapability;
  stage: AiExecutionStage;
  requirementText: string;
  feature: { code: string; name: string } | null;
  sourceUserStory: {
    code: string;
    title: string;
    deleted: boolean;
  } | null;
  testCase: {
    id: string;
    code: string;
    name: string;
    deleted: boolean;
  } | null;
  result: AiExecutionResult | null;
  logs: AiExecutionLogEntry[];
};
