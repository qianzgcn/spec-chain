import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { AiCapability, AiExecutionOrigin } from "@/generated/prisma/enums";
import {
  getAiExecutionStageLabel,
  mapAiExecutionStatus,
} from "@/lib/execution-tasks/meta";
import {
  type AiExecutionTaskDetail,
  type AiExecutionResult,
  type ExecutionTaskSummary,
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
  const aiExecutions = await db.aiExecution.findMany({
    where: {
      projectId,
      deletedAt: null,
      origin: AiExecutionOrigin.USER,
    },
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
  });

  return aiExecutions.map((execution): ExecutionTaskSummary => ({
    id: execution.id,
    type: execution.capability,
    status: mapAiExecutionStatus(execution.status),
    stageLabel: getAiExecutionStageLabel(execution.capability, execution.stage),
    content: toAiTaskContent(execution),
    queuedAt: execution.queuedAt.toISOString(),
    startedAt: execution.startedAt?.toISOString() ?? null,
    finishedAt: execution.finishedAt?.toISOString() ?? null,
    durationMs: execution.durationMs,
    requestedBy: execution.requestedBy.username,
  }));
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
  userStoryDrafts: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      deletedAt: true,
      confirmedUserStoryId: true,
    },
  },
  consistencyItems: {
    select: {
      outcome: true,
      reason: true,
      userStory: { select: { code: true, title: true } },
      testCase: { select: { code: true, name: true } },
      userStoryDraft: { select: { status: true } },
      testCaseDraft: {
        select: { operation: true, status: true },
      },
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
  if (execution.capability === AiCapability.CHECK_CONSISTENCY) {
    const requirementDraftCount = execution.consistencyItems.filter(
      (item) => item.userStoryDraft,
    ).length;
    return {
      kind: "CONSISTENCY_CHECK",
      deleted: false,
      totalCount: execution.consistencyItems.length,
      unchangedCount: execution.consistencyItems.filter(
        (item) => item.outcome === "UNCHANGED",
      ).length,
      requirementDraftCount,
      testCaseCreateCount: execution.consistencyItems.filter(
        (item) => item.testCaseDraft?.operation === "CREATE",
      ).length,
      testCaseUpdateCount: execution.consistencyItems.filter(
        (item) => item.testCaseDraft?.operation === "UPDATE",
      ).length,
      testCaseRetireCount: execution.consistencyItems.filter(
        (item) => item.testCaseDraft?.operation === "RETIRE",
      ).length,
      attentionCount: execution.consistencyItems.filter(
        (item) => item.outcome === "NEEDS_ATTENTION",
      ).length,
      attentionItems: execution.consistencyItems
        .filter((item) => item.outcome === "NEEDS_ATTENTION")
        .map((item) => ({
          label: item.testCase
            ? `${item.testCase.code} · ${item.testCase.name}`
            : item.userStory
              ? `${item.userStory.code} · ${item.userStory.title}`
              : "未映射对象",
          reason: item.reason,
        })),
    };
  }
  const userStoryDraft = execution.userStoryDrafts[0];
  if (userStoryDraft) {
    return {
      kind: "USER_STORY",
      id: userStoryDraft.id,
      status: userStoryDraft.status,
      deleted: Boolean(userStoryDraft.deletedAt),
      confirmedUserStoryId: userStoryDraft.confirmedUserStoryId,
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

export async function getExecutionTaskDetail(
  projectId: string,
  taskId: string,
): Promise<AiExecutionTaskDetail | null> {
  const execution = await db.aiExecution.findFirst({
    where: {
      id: taskId,
      projectId,
      deletedAt: null,
      origin: AiExecutionOrigin.USER,
    },
    select: AI_EXECUTION_DETAIL_SELECT,
  });
  return execution ? toAiExecutionTaskDetail(execution) : null;
}
