import type {
  AiCapability,
  AiDraftStatus,
  AiExecutionLogLevel,
  AiExecutionStage,
  RunStatus,
  TestRunStage,
} from "@/generated/prisma/enums";

export const TEST_CASE_RUN_TASK_TYPE = "TEST_CASE_RUN" as const;

export type ExecutionTaskType = AiCapability | typeof TEST_CASE_RUN_TASK_TYPE;

export type ExecutionTaskStatus =
  "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "STOPPED";

export type ExecutionTaskKind = "AI" | "TEST_RUN";

export type ExecutionTaskSummary = {
  id: string;
  kind: ExecutionTaskKind;
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

export type AiExecutionResult =
  | AiExecutionUserStoryResult
  | AiExecutionTestCaseResult
  | AiExecutionAutomationScriptResult;

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
  kind: "AI";
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

export type TestRunExecutionTaskDetail = ExecutionTaskDetailBase & {
  kind: "TEST_RUN";
  runStatus: RunStatus;
  stage: TestRunStage;
  testCase: {
    id: string;
    code: string;
    name: string;
    deleted: boolean;
  };
  logContent: string | null;
  hasScreenshot: boolean;
  artifactsExpired: boolean;
  cancelRequested: boolean;
  baseUrl: string;
  generatedScriptInRun: boolean;
};

export type ExecutionTaskDetail =
  AiExecutionTaskDetail | TestRunExecutionTaskDetail;
