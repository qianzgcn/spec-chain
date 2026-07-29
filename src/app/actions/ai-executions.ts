"use server";

import { z } from "zod";

import { revalidatePath } from "next/cache";

import {
  AiCapability,
  AiExecutionLogLevel,
  AiExecutionStage,
  AiExecutionStatus,
} from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { startAiQueueWorker } from "@/server/ai/launcher";
import { getCurrentProject } from "@/server/projects/current-project";

const createExecutionSchema = z.object({
  requirementText: z
    .string()
    .trim()
    .min(1, "请输入需求内容")
    .max(10_000, "需求内容不能超过 10000 个字符"),
  featureId: z.string().nullable().optional(),
});

async function getCurrentActionContext() {
  const [user, project] = await Promise.all([
    requireUser(),
    getCurrentProject(),
  ]);
  return { user, project };
}

export async function createAiUserStoryExecutionAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { user, project } = await getCurrentActionContext();
  const parsed = createExecutionSchema.safeParse(input);
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
    await db.aiExecution.update({
      where: { id: execution.id },
      data: {
        status: AiExecutionStatus.FAILED,
        finishedAt: new Date(),
        errorMessage: "无法启动 AI 队列子进程",
        logs: {
          create: {
            position: 1,
            level: AiExecutionLogLevel.ERROR,
            stage: AiExecutionStage.QUEUED,
            message: "任务失败（WORKER_START）：无法启动 AI 队列子进程。",
          },
        },
      },
    });
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
