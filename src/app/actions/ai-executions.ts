"use server";

import { revalidatePath } from "next/cache";

import {
  AiCapability,
  AiExecutionLogLevel,
  AiExecutionStage,
  AiExecutionStatus,
} from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import {
  createAiExecutionSchema,
  deleteAiExecutionSchema,
  retryAiExecutionSchema,
} from "@/lib/ai/execution-schema";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { startAiQueueWorker } from "@/server/ai/launcher";
import { getCurrentProject } from "@/server/projects/current-project";

async function getCurrentActionContext() {
  const [user, project] = await Promise.all([
    requireUser(),
    getCurrentProject(),
  ]);
  return { user, project };
}

async function markWorkerStartFailure(
  executionId: string,
  logPosition: number,
) {
  const finishedAt = new Date();

  await db.$transaction(async (transaction) => {
    const updated = await transaction.aiExecution.updateMany({
      where: {
        id: executionId,
        status: AiExecutionStatus.QUEUED,
        deletedAt: null,
      },
      data: {
        status: AiExecutionStatus.FAILED,
        finishedAt,
        errorMessage: "无法启动 AI 队列子进程",
      },
    });
    if (updated.count === 0) return;

    await transaction.aiExecutionLog.create({
      data: {
        executionId,
        position: logPosition,
        level: AiExecutionLogLevel.ERROR,
        stage: AiExecutionStage.QUEUED,
        message: "任务失败（WORKER_START）：无法启动 AI 队列子进程。",
        createdAt: finishedAt,
      },
    });
  });
}

export async function createAiUserStoryExecutionAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { user, project } = await getCurrentActionContext();
  const parsed = createAiExecutionSchema.safeParse(input);
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }
  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查需求内容",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  if (parsed.data.featureId) {
    const feature = await db.feature.findFirst({
      where: {
        id: parsed.data.featureId,
        projectId: project.id,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!feature) {
      return { ok: false, message: "所属 FE 不存在或已删除" };
    }
  }

  const execution = await db.aiExecution.create({
    data: {
      projectId: project.id,
      requestedById: user.id,
      featureId: parsed.data.featureId ?? null,
      capability: AiCapability.GENERATE_USER_STORY,
      status: AiExecutionStatus.QUEUED,
      requirementText: parsed.data.requirementText,
      logs: {
        create: {
          position: 0,
          level: AiExecutionLogLevel.INFO,
          stage: AiExecutionStage.QUEUED,
          message: "任务已进入队列，等待 AI 执行器处理。",
        },
      },
    },
    select: { id: true },
  });

  if (!startAiQueueWorker()) {
    await markWorkerStartFailure(execution.id, 1);
    revalidatePath("/ai-executions");
    return {
      ok: false,
      message: "无法启动 AI 队列，请查看服务日志",
    };
  }

  revalidatePath("/ai-executions");
  return {
    ok: true,
    message: "AI 任务已进入队列",
    data: execution,
  };
}

export async function retryAiExecutionAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { user, project } = await getCurrentActionContext();
  const parsed = retryAiExecutionSchema.safeParse(input);
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }
  if (!parsed.success) {
    return { ok: false, message: "任务 ID 不正确" };
  }

  const retryAt = new Date();
  const retryResult = await db.$transaction(async (transaction) => {
    const execution = await transaction.aiExecution.findFirst({
      where: {
        id: parsed.data.executionId,
        projectId: project.id,
        deletedAt: null,
      },
      select: {
        status: true,
        logs: {
          orderBy: { position: "desc" },
          take: 1,
          select: { position: true },
        },
      },
    });
    if (!execution) {
      return { ok: false as const, message: "执行任务不存在" };
    }
    if (execution.status !== AiExecutionStatus.FAILED) {
      return {
        ok: false as const,
        message: "只有失败的任务可以重新运行",
      };
    }

    const updated = await transaction.aiExecution.updateMany({
      where: {
        id: parsed.data.executionId,
        projectId: project.id,
        status: AiExecutionStatus.FAILED,
        deletedAt: null,
      },
      data: {
        requestedById: user.id,
        status: AiExecutionStatus.QUEUED,
        stage: AiExecutionStage.QUEUED,
        modelProfileNameSnapshot: null,
        modelIdSnapshot: null,
        skillNameSnapshot: null,
        skillVersionSnapshot: null,
        repositorySnapshot: null,
        codeReferences: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        errorMessage: null,
        queuedAt: retryAt,
        startedAt: null,
        finishedAt: null,
        durationMs: null,
        workerId: null,
      },
    });
    if (updated.count === 0) {
      return {
        ok: false as const,
        message: "任务状态已发生变化，请刷新后重试",
      };
    }

    const logPosition = (execution.logs[0]?.position ?? -1) + 1;
    await transaction.aiExecutionLog.create({
      data: {
        executionId: parsed.data.executionId,
        position: logPosition,
        level: AiExecutionLogLevel.INFO,
        stage: AiExecutionStage.QUEUED,
        message: "任务已重新进入队列，等待 AI 执行器处理。",
        createdAt: retryAt,
      },
    });

    return {
      ok: true as const,
      id: parsed.data.executionId,
      nextLogPosition: logPosition + 1,
    };
  });
  if (!retryResult.ok) {
    return retryResult;
  }

  if (!startAiQueueWorker()) {
    await markWorkerStartFailure(retryResult.id, retryResult.nextLogPosition);
    revalidatePath("/ai-executions");
    revalidatePath(`/ai-executions/${retryResult.id}`);
    return {
      ok: false,
      message: "无法启动 AI 队列，请查看服务日志",
    };
  }

  revalidatePath("/ai-executions");
  revalidatePath(`/ai-executions/${retryResult.id}`);
  return {
    ok: true,
    message: "任务已重新进入队列",
    data: { id: retryResult.id },
  };
}

export async function deleteAiExecutionAction(
  input: unknown,
): Promise<ActionResult> {
  const { project } = await getCurrentActionContext();
  const parsed = deleteAiExecutionSchema.safeParse(input);
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }
  if (!parsed.success) {
    return { ok: false, message: "任务 ID 不正确" };
  }

  const execution = await db.aiExecution.findFirst({
    where: {
      id: parsed.data.executionId,
      projectId: project.id,
      deletedAt: null,
    },
    select: { status: true },
  });
  if (!execution) {
    return { ok: false, message: "执行任务不存在或已删除" };
  }
  if (
    execution.status === AiExecutionStatus.QUEUED ||
    execution.status === AiExecutionStatus.RUNNING
  ) {
    return { ok: false, message: "排队中或运行中的任务不能删除" };
  }

  const deleted = await db.aiExecution.updateMany({
    where: {
      id: parsed.data.executionId,
      projectId: project.id,
      deletedAt: null,
      status: {
        in: [AiExecutionStatus.SUCCEEDED, AiExecutionStatus.FAILED],
      },
    },
    data: { deletedAt: new Date() },
  });
  if (deleted.count === 0) {
    return { ok: false, message: "任务状态已发生变化，请刷新后重试" };
  }

  revalidatePath("/ai-executions");
  revalidatePath(`/ai-executions/${parsed.data.executionId}`);
  return { ok: true, message: "执行任务已删除" };
}
