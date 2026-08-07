import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import {
  AiCapability,
  AiExecutionOrigin,
  RequirementImplementationStatus,
  TestCoverageStatus,
} from "@/generated/prisma/enums";
import {
  getAiExecutionStageLabel,
  mapAiExecutionStatus,
} from "@/lib/execution-tasks/meta";
import {
  type AiExecutionTaskDetail,
  type AiExecutionResult,
  type ExecutionTaskSummary,
  type ExecutionTaskType,
  type ImplementationReviewEvidence,
} from "@/lib/execution-tasks/types";
import { db } from "@/server/db";

const SUMMARY_LIMIT = 100;

function deriveExecutionTaskType(
  capability: AiCapability,
  execution: {
    testCaseSnapshotFingerprint?: string | null;
    testCaseDraftBatch?: {
      drafts: Array<{ changeType?: string; targetTestCaseId?: string | null }>;
    } | null;
  },
): ExecutionTaskType {
  if (capability === AiCapability.GENERATE_TEST_CASES) {
    const firstDraft = execution.testCaseDraftBatch?.drafts?.[0];
    if (
      firstDraft?.changeType === "UPDATE" ||
      Boolean(firstDraft?.targetTestCaseId)
    ) {
      return "GENERATE_TEST_CASES_UPDATE";
    }
    if (firstDraft?.changeType === "CREATE") {
      return "GENERATE_TEST_CASES_CREATE";
    }
    if (Boolean(execution.testCaseSnapshotFingerprint)) {
      return "GENERATE_TEST_CASES_UPDATE";
    }
    return "GENERATE_TEST_CASES_CREATE";
  }
  return capability;
}

function toAiTaskContent(execution: {
  capability: AiCapability;
  requirementText: string;
  testCase: { code: string; name: string } | null;
  deliveryVersion: { code: string; name: string } | null;
}) {
  if (
    execution.capability === AiCapability.GENERATE_AUTOMATION_SCRIPT &&
    execution.testCase
  ) {
    return `${execution.testCase.code} · ${execution.testCase.name}`;
  }
  if (
    execution.capability === AiCapability.REVIEW_REQUIREMENT_IMPLEMENTATION &&
    execution.deliveryVersion
  ) {
    return `${execution.deliveryVersion.code} · ${execution.deliveryVersion.name}`;
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
      testCaseSnapshotFingerprint: true,
      queuedAt: true,
      startedAt: true,
      finishedAt: true,
      durationMs: true,
      requestedBy: { select: { username: true } },
      testCase: { select: { code: true, name: true } },
      deliveryVersion: { select: { code: true, name: true } },
      testCaseDraftBatch: {
        select: {
          drafts: {
            where: { deletedAt: null },
            select: { changeType: true, targetTestCaseId: true },
            take: 1,
          },
        },
      },
    },
  });

  return aiExecutions.map((execution): ExecutionTaskSummary => ({
    id: execution.id,
    type: deriveExecutionTaskType(execution.capability, execution),
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
  testCaseSnapshotFingerprint: true,
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
  deliveryVersion: { select: { id: true, code: true, name: true } },
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
  implementationReview: {
    select: {
      conclusion: true,
      items: {
        orderBy: { userStoryCodeSnapshot: "asc" },
        select: {
          userStoryId: true,
          userStoryCodeSnapshot: true,
          titleSnapshot: true,
          implementationStatus: true,
          coverageStatus: true,
          summary: true,
          criteria: {
            orderBy: { position: "asc" },
            select: {
              position: true,
              givenSnapshot: true,
              whenSnapshot: true,
              thenSnapshot: true,
              status: true,
              reason: true,
              evidence: true,
            },
          },
          findings: {
            orderBy: { createdAt: "asc" },
            select: {
              type: true,
              severity: true,
              title: true,
              detail: true,
              evidence: true,
            },
          },
        },
      },
    },
  },
  testCaseDraftBatch: {
    select: {
      id: true,
      deletedAt: true,
      drafts: {
        where: { deletedAt: null },
        select: { status: true, changeType: true, targetTestCaseId: true },
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
  if (
    execution.capability === AiCapability.REVIEW_REQUIREMENT_IMPLEMENTATION &&
    execution.implementationReview &&
    execution.deliveryVersion
  ) {
    const items = execution.implementationReview.items;
    return {
      kind: "IMPLEMENTATION_REVIEW",
      deleted: false,
      deliveryVersion: execution.deliveryVersion,
      conclusion: execution.implementationReview.conclusion,
      totalCount: items.length,
      implementedCount: items.filter(
        (item) =>
          item.implementationStatus ===
          RequirementImplementationStatus.IMPLEMENTED,
      ).length,
      partialCount: items.filter(
        (item) =>
          item.implementationStatus ===
          RequirementImplementationStatus.PARTIALLY_IMPLEMENTED,
      ).length,
      notImplementedCount: items.filter(
        (item) =>
          item.implementationStatus ===
          RequirementImplementationStatus.NOT_IMPLEMENTED,
      ).length,
      unconfirmedCount: items.filter(
        (item) =>
          item.implementationStatus ===
          RequirementImplementationStatus.UNCONFIRMED,
      ).length,
      coverageGapCount: items.filter(
        (item) => item.coverageStatus === TestCoverageStatus.INSUFFICIENT,
      ).length,
      findingCount: items.reduce(
        (count, item) => count + item.findings.length,
        0,
      ),
      items: items.map((item) => ({
        userStoryId: item.userStoryId,
        code: item.userStoryCodeSnapshot,
        title: item.titleSnapshot,
        implementationStatus: item.implementationStatus,
        coverageStatus: item.coverageStatus,
        summary: item.summary,
        criteria: item.criteria.map((criterion) => ({
          position: criterion.position,
          given: criterion.givenSnapshot,
          when: criterion.whenSnapshot,
          then: criterion.thenSnapshot,
          status: criterion.status,
          reason: criterion.reason,
          evidence: JSON.parse(
            criterion.evidence,
          ) as ImplementationReviewEvidence[],
        })),
        findings: item.findings.map((finding) => ({
          ...finding,
          evidence: JSON.parse(
            finding.evidence,
          ) as ImplementationReviewEvidence[],
        })),
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
    type: deriveExecutionTaskType(execution.capability, execution),
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
    deliveryVersion: execution.deliveryVersion,
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
