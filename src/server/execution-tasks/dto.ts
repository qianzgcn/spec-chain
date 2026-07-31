import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { AiCapability } from "@/generated/prisma/enums";
import {
  getAiExecutionStageLabel,
  mapAiExecutionStatus,
  mapTestRunStatus,
  TEST_RUN_STAGE_LABELS,
} from "@/lib/execution-tasks/meta";
import {
  TEST_CASE_RUN_TASK_TYPE,
  type AiExecutionTaskDetail,
  type AiExecutionResult,
  type ExecutionTaskDetail,
  type ExecutionTaskSummary,
  type TestRunExecutionTaskDetail,
} from "@/lib/execution-tasks/types";
import { db } from "@/server/db";

const SUMMARY_LIMIT = 100;

function toAiTaskContent(execution: {
  capability: AiCapability;
  requirementText: string;
  testCase: { code: string; name: string } | null;
}) {
  if (
    execution.capability === AiCapability.GENERATE_AUTOMATION_SCRIPT &&
    execution.testCase
  ) {
    return `${execution.testCase.code} · ${execution.testCase.name}`;
  }
  return execution.requirementText;
}

export async function getExecutionTaskSummaries(
  projectId: string,
): Promise<ExecutionTaskSummary[]> {
  const [aiExecutions, testRuns] = await Promise.all([
    db.aiExecution.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { queuedAt: "desc" },
      take: SUMMARY_LIMIT,
      select: {
        id: true,
        capability: true,
        status: true,
        stage: true,
        requirementText: true,
        queuedAt: true,
        startedAt: true,
        finishedAt: true,
        durationMs: true,
        requestedBy: { select: { username: true } },
        testCase: { select: { code: true, name: true } },
      },
    }),
    db.testRun.findMany({
      where: {
        deletedAt: null,
        testCase: { projectId },
      },
      orderBy: { queuedAt: "desc" },
      take: SUMMARY_LIMIT,
      select: {
        id: true,
        status: true,
        stage: true,
        queuedAt: true,
        startedAt: true,
        finishedAt: true,
        durationMs: true,
        testCaseCodeSnapshot: true,
        testCaseNameSnapshot: true,
        requestedBy: { select: { username: true } },
      },
    }),
  ]);

  return [
    ...aiExecutions.map((execution): ExecutionTaskSummary => ({
      id: execution.id,
      kind: "AI",
      type: execution.capability,
      status: mapAiExecutionStatus(execution.status),
      stageLabel: getAiExecutionStageLabel(
        execution.capability,
        execution.stage,
      ),
      content: toAiTaskContent(execution),
      queuedAt: execution.queuedAt.toISOString(),
      startedAt: execution.startedAt?.toISOString() ?? null,
      finishedAt: execution.finishedAt?.toISOString() ?? null,
      durationMs: execution.durationMs,
      requestedBy: execution.requestedBy.username,
    })),
    ...testRuns.map((run): ExecutionTaskSummary => ({
      id: run.id,
      kind: "TEST_RUN",
      type: TEST_CASE_RUN_TASK_TYPE,
      status: mapTestRunStatus(run.status),
      stageLabel: TEST_RUN_STAGE_LABELS[run.stage],
      content: `${run.testCaseCodeSnapshot} · ${run.testCaseNameSnapshot}`,
      queuedAt: run.queuedAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      finishedAt: run.finishedAt?.toISOString() ?? null,
      durationMs: run.durationMs,
      requestedBy: run.requestedBy.username,
    })),
  ]
    .toSorted(
      (left, right) =>
        new Date(right.queuedAt).getTime() - new Date(left.queuedAt).getTime(),
    )
    .slice(0, SUMMARY_LIMIT);
}

const AI_EXECUTION_DETAIL_SELECT = {
  id: true,
  capability: true,
  status: true,
  stage: true,
  requirementText: true,
  queuedAt: true,
  startedAt: true,
  finishedAt: true,
  durationMs: true,
  errorMessage: true,
  modelProfileNameSnapshot: true,
  modelIdSnapshot: true,
  skillNameSnapshot: true,
  skillVersionSnapshot: true,
  promptTokens: true,
  completionTokens: true,
  totalTokens: true,
  requestedBy: { select: { username: true } },
  feature: { select: { code: true, name: true } },
  sourceUserStory: {
    select: { code: true, title: true, deletedAt: true },
  },
  testCase: {
    select: { id: true, code: true, name: true, deletedAt: true },
  },
  logs: {
    orderBy: { position: "asc" },
    select: {
      position: true,
      level: true,
      stage: true,
      message: true,
      createdAt: true,
    },
  },
  draft: {
    select: {
      id: true,
      status: true,
      deletedAt: true,
      confirmedUserStoryId: true,
    },
  },
  testCaseDraftBatch: {
    select: {
      id: true,
      deletedAt: true,
      drafts: {
        where: { deletedAt: null },
        select: { status: true },
      },
    },
  },
} satisfies Prisma.AiExecutionSelect;

type AiExecutionDetailRecord = Prisma.AiExecutionGetPayload<{
  select: typeof AI_EXECUTION_DETAIL_SELECT;
}>;

function toAiExecutionResult(
  execution: AiExecutionDetailRecord,
): AiExecutionResult | null {
  if (execution.draft) {
    return {
      kind: "USER_STORY",
      id: execution.draft.id,
      status: execution.draft.status,
      deleted: Boolean(execution.draft.deletedAt),
      confirmedUserStoryId: execution.draft.confirmedUserStoryId,
    };
  }
  if (execution.testCaseDraftBatch) {
    return {
      kind: "TEST_CASE_BATCH",
      id: execution.testCaseDraftBatch.id,
      deleted: Boolean(execution.testCaseDraftBatch.deletedAt),
      pendingCount: execution.testCaseDraftBatch.drafts.filter(
        (item) => item.status === "PENDING",
      ).length,
      confirmedCount: execution.testCaseDraftBatch.drafts.filter(
        (item) => item.status === "CONFIRMED",
      ).length,
    };
  }
  if (
    execution.capability === AiCapability.GENERATE_AUTOMATION_SCRIPT &&
    execution.testCase &&
    execution.status === "SUCCEEDED"
  ) {
    return {
      kind: "AUTOMATION_SCRIPT",
      testCaseId: execution.testCase.id,
      deleted: Boolean(execution.testCase.deletedAt),
    };
  }
  return null;
}

function toAiExecutionTaskDetail(
  execution: AiExecutionDetailRecord,
): AiExecutionTaskDetail {
  return {
    id: execution.id,
    kind: "AI",
    type: execution.capability,
    capability: execution.capability,
    status: mapAiExecutionStatus(execution.status),
    stage: execution.stage,
    stageLabel: getAiExecutionStageLabel(execution.capability, execution.stage),
    content: toAiTaskContent(execution),
    requirementText: execution.requirementText,
    queuedAt: execution.queuedAt.toISOString(),
    startedAt: execution.startedAt?.toISOString() ?? null,
    finishedAt: execution.finishedAt?.toISOString() ?? null,
    durationMs: execution.durationMs,
    requestedBy: execution.requestedBy.username,
    errorMessage: execution.errorMessage,
    modelProfileNameSnapshot: execution.modelProfileNameSnapshot,
    modelIdSnapshot: execution.modelIdSnapshot,
    skillNameSnapshot: execution.skillNameSnapshot,
    skillVersionSnapshot: execution.skillVersionSnapshot,
    promptTokens: execution.promptTokens,
    completionTokens: execution.completionTokens,
    totalTokens: execution.totalTokens,
    feature: execution.feature,
    sourceUserStory: execution.sourceUserStory
      ? {
          code: execution.sourceUserStory.code,
          title: execution.sourceUserStory.title,
          deleted: Boolean(execution.sourceUserStory.deletedAt),
        }
      : null,
    testCase: execution.testCase
      ? {
          id: execution.testCase.id,
          code: execution.testCase.code,
          name: execution.testCase.name,
          deleted: Boolean(execution.testCase.deletedAt),
        }
      : null,
    result: toAiExecutionResult(execution),
    logs: execution.logs
      .filter((log) => log.createdAt.getTime() >= execution.queuedAt.getTime())
      .map((log) => ({
        ...log,
        createdAt: log.createdAt.toISOString(),
      })),
  };
}

async function getAiExecutionTaskDetail(projectId: string, taskId: string) {
  const execution = await db.aiExecution.findFirst({
    where: { id: taskId, projectId, deletedAt: null },
    select: AI_EXECUTION_DETAIL_SELECT,
  });
  return execution ? toAiExecutionTaskDetail(execution) : null;
}

const TEST_RUN_DETAIL_SELECT = {
  id: true,
  status: true,
  stage: true,
  queuedAt: true,
  startedAt: true,
  finishedAt: true,
  durationMs: true,
  errorSummary: true,
  logContent: true,
  screenshotPath: true,
  artifactsExpireAt: true,
  artifactsPurgedAt: true,
  cancelRequestedAt: true,
  baseUrlSnapshot: true,
  generatedScriptInRun: true,
  modelProfileNameSnapshot: true,
  modelIdSnapshot: true,
  skillNameSnapshot: true,
  skillVersionSnapshot: true,
  promptTokens: true,
  completionTokens: true,
  totalTokens: true,
  testCaseCodeSnapshot: true,
  testCaseNameSnapshot: true,
  requestedBy: { select: { username: true } },
  testCase: {
    select: { id: true, code: true, name: true, deletedAt: true },
  },
} satisfies Prisma.TestRunSelect;

type TestRunDetailRecord = Prisma.TestRunGetPayload<{
  select: typeof TEST_RUN_DETAIL_SELECT;
}>;

function toTestRunExecutionTaskDetail(
  run: TestRunDetailRecord,
): TestRunExecutionTaskDetail {
  const artifactsExpired =
    Boolean(run.artifactsPurgedAt) ||
    run.artifactsExpireAt.getTime() <= Date.now();

  return {
    id: run.id,
    kind: "TEST_RUN",
    type: TEST_CASE_RUN_TASK_TYPE,
    status: mapTestRunStatus(run.status),
    runStatus: run.status,
    stage: run.stage,
    stageLabel: TEST_RUN_STAGE_LABELS[run.stage],
    content: `${run.testCaseCodeSnapshot} · ${run.testCaseNameSnapshot}`,
    queuedAt: run.queuedAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    durationMs: run.durationMs,
    requestedBy: run.requestedBy.username,
    errorMessage: run.errorSummary,
    modelProfileNameSnapshot: run.modelProfileNameSnapshot,
    modelIdSnapshot: run.modelIdSnapshot,
    skillNameSnapshot: run.skillNameSnapshot,
    skillVersionSnapshot: run.skillVersionSnapshot,
    promptTokens: run.promptTokens,
    completionTokens: run.completionTokens,
    totalTokens: run.totalTokens,
    testCase: {
      id: run.testCase.id,
      code: run.testCase.code,
      name: run.testCase.name,
      deleted: Boolean(run.testCase.deletedAt),
    },
    logContent: artifactsExpired ? null : run.logContent,
    hasScreenshot: !artifactsExpired && Boolean(run.screenshotPath),
    artifactsExpired,
    cancelRequested: Boolean(run.cancelRequestedAt),
    baseUrl: run.baseUrlSnapshot,
    generatedScriptInRun: run.generatedScriptInRun,
  };
}

async function getTestRunExecutionTaskDetail(
  projectId: string,
  taskId: string,
) {
  const run = await db.testRun.findFirst({
    where: {
      id: taskId,
      deletedAt: null,
      testCase: { projectId },
    },
    select: TEST_RUN_DETAIL_SELECT,
  });
  return run ? toTestRunExecutionTaskDetail(run) : null;
}

export async function getExecutionTaskDetail(
  projectId: string,
  taskId: string,
): Promise<ExecutionTaskDetail | null> {
  return (
    (await getAiExecutionTaskDetail(projectId, taskId)) ??
    getTestRunExecutionTaskDetail(projectId, taskId)
  );
}
