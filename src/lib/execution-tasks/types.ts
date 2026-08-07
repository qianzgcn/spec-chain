import type {
  AiCapability,
  AiDraftStatus,
  AiExecutionLogLevel,
  AiExecutionStage,
  AcceptanceCriterionReviewStatus,
  ImplementationFindingSeverity,
  ImplementationFindingType,
  ImplementationReviewConclusion,
  RequirementImplementationStatus,
  TestCoverageStatus,
} from "@/generated/prisma/enums";

export type ExecutionTaskType =
  | AiCapability
  | "GENERATE_TEST_CASES_CREATE"
  | "GENERATE_TEST_CASES_UPDATE";

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

export type ImplementationReviewEvidence = {
  repository: string;
  commitSha: string;
  path: string;
  lineStart: number;
  lineEnd: number;
  summary: string;
};

export type AiExecutionImplementationReviewResult = {
  kind: "IMPLEMENTATION_REVIEW";
  deleted: false;
  deliveryVersion: { id: string; code: string; name: string };
  conclusion: ImplementationReviewConclusion;
  totalCount: number;
  implementedCount: number;
  partialCount: number;
  notImplementedCount: number;
  unconfirmedCount: number;
  coverageGapCount: number;
  findingCount: number;
  items: Array<{
    userStoryId: string;
    code: string;
    title: string;
    implementationStatus: RequirementImplementationStatus;
    coverageStatus: TestCoverageStatus;
    summary: string;
    criteria: Array<{
      position: number;
      given: string;
      when: string;
      then: string;
      status: AcceptanceCriterionReviewStatus;
      reason: string;
      evidence: ImplementationReviewEvidence[];
    }>;
    findings: Array<{
      type: ImplementationFindingType;
      severity: ImplementationFindingSeverity;
      title: string;
      detail: string;
      evidence: ImplementationReviewEvidence[];
    }>;
  }>;
};

export type AiExecutionResult =
  | AiExecutionUserStoryResult
  | AiExecutionTestCaseResult
  | AiExecutionAutomationScriptResult
  | AiExecutionImplementationReviewResult;

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
  deliveryVersion: { id: string; code: string; name: string } | null;
  result: AiExecutionResult | null;
  logs: AiExecutionLogEntry[];
};
