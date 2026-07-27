import "server-only";

import { db } from "@/server/db";

function parseJsonArray<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export async function getAiExecutionSummaries(projectId: string) {
  const executions = await db.aiExecution.findMany({
    where: { projectId },
    orderBy: { queuedAt: "desc" },
    take: 100,
    select: {
      id: true,
      status: true,
      stage: true,
      requirementText: true,
      queuedAt: true,
      startedAt: true,
      finishedAt: true,
      durationMs: true,
      errorMessage: true,
      requestedBy: { select: { username: true } },
      feature: { select: { code: true, name: true } },
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

  return executions.map((execution) => ({
    id: execution.id,
    status: execution.status,
    stage: execution.stage,
    requirementText: execution.requirementText,
    queuedAt: execution.queuedAt.toISOString(),
    startedAt: execution.startedAt?.toISOString() ?? null,
    finishedAt: execution.finishedAt?.toISOString() ?? null,
    durationMs: execution.durationMs,
    errorMessage: execution.errorMessage,
    requestedBy: execution.requestedBy.username,
    feature: execution.feature,
    draft: execution.draft
      ? {
          id: execution.draft.id,
          status: execution.draft.status,
          deleted: Boolean(execution.draft.deletedAt),
          confirmedUserStoryId: execution.draft.confirmedUserStoryId,
        }
      : null,
  }));
}

export async function getAiExecutionDetail(
  projectId: string,
  executionId: string,
) {
  const execution = await db.aiExecution.findFirst({
    where: { id: executionId, projectId },
    select: {
      id: true,
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
      repositorySnapshot: true,
      codeReferences: true,
      promptTokens: true,
      completionTokens: true,
      totalTokens: true,
      requestedBy: { select: { username: true } },
      feature: { select: { code: true, name: true } },
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

  return {
    ...execution,
    queuedAt: execution.queuedAt.toISOString(),
    startedAt: execution.startedAt?.toISOString() ?? null,
    finishedAt: execution.finishedAt?.toISOString() ?? null,
    requestedBy: execution.requestedBy.username,
    repositories: parseJsonArray<{
      repositoryId: string;
      provider: "GITHUB" | "GITEE";
      owner: string;
      repository: string;
      branch: string;
      commitSha: string;
    }>(execution.repositorySnapshot),
    codeReferences: parseJsonArray<{
      repositoryId: string;
      provider: "GITHUB" | "GITEE";
      owner: string;
      repository: string;
      branch: string;
      commitSha: string;
      path: string;
      reason: string;
    }>(execution.codeReferences),
    repositorySnapshot: undefined,
    draft: execution.draft
      ? {
          id: execution.draft.id,
          status: execution.draft.status,
          deleted: Boolean(execution.draft.deletedAt),
          confirmedUserStoryId: execution.draft.confirmedUserStoryId,
        }
      : null,
  };
}
