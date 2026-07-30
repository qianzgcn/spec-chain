import "server-only";

import { db } from "@/server/db";

export async function getAiExecutionSummaries(projectId: string) {
  const executions = await db.aiExecution.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { queuedAt: "desc" },
    take: 100,
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
      feature: { select: { code: true, name: true } },
    },
  });

  return executions.map((execution) => ({
    id: execution.id,
    capability: execution.capability,
    status: execution.status,
    stage: execution.stage,
    requirementText: execution.requirementText,
    queuedAt: execution.queuedAt.toISOString(),
    startedAt: execution.startedAt?.toISOString() ?? null,
    finishedAt: execution.finishedAt?.toISOString() ?? null,
    durationMs: execution.durationMs,
    requestedBy: execution.requestedBy.username,
    feature: execution.feature,
  }));
}

export async function getAiExecutionDetail(
  projectId: string,
  executionId: string,
) {
  const execution = await db.aiExecution.findFirst({
    where: { id: executionId, projectId, deletedAt: null },
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
    },
  });
  if (!execution) return null;

  const { draft, logs, requestedBy, ...detail } = execution;
  const latestLogs = logs.filter(
    (log) => log.createdAt.getTime() >= execution.queuedAt.getTime(),
  );
  return {
    ...detail,
    queuedAt: execution.queuedAt.toISOString(),
    startedAt: execution.startedAt?.toISOString() ?? null,
    finishedAt: execution.finishedAt?.toISOString() ?? null,
    requestedBy: requestedBy.username,
    logs: latestLogs.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
    })),
    result: draft
      ? {
          id: draft.id,
          status: draft.status,
          deleted: Boolean(draft.deletedAt),
          confirmedUserStoryId: draft.confirmedUserStoryId,
        }
      : null,
  };
}
