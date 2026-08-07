"use server";

import { revalidatePath } from "next/cache";

import {
  AiCapability,
  AiDraftStatus,
  AiExecutionOrigin,
  AiExecutionLogLevel,
  AiExecutionStage,
  AiExecutionStatus,
} from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import { isDeliveryVersionContentLocked } from "@/lib/delivery-versions/rules";
import {
  createAiTestCaseExecutionSchema,
  createAiUserStoryExecutionSchema,
  createAutomationScriptExecutionSchema,
  createImplementationReviewExecutionSchema,
  deleteExecutionTaskSchema,
  retryExecutionTaskSchema,
} from "@/lib/ai/execution-schema";
import {
  createTestCaseSetFingerprint,
  createUserStoryTestDesignFingerprint,
} from "@/lib/test-cases/sync-fingerprint";
import { formatUserStoryForTestCaseGeneration } from "@/ai/test-case-requirement";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  createQueuedAiExecutionRecord,
  formatAutomationScriptRequirement,
} from "@/server/tasks/ai-execution-record";
import { startTaskScheduler } from "@/server/tasks/launcher";
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
        errorMessage: "无法启动任务调度器",
      },
    });
    if (updated.count === 0) return;

    await transaction.aiExecutionLog.create({
      data: {
        executionId,
        position: logPosition,
        level: AiExecutionLogLevel.ERROR,
        stage: AiExecutionStage.QUEUED,
        message: "任务失败（SCHEDULER_START）：无法启动任务调度器。",
        createdAt: finishedAt,
      },
    });
  });
}

async function createQueuedExecution(input: {
  projectId: string;
  requestedById: string;
  capability: AiCapability;
  requirementText: string;
  featureId?: string | null;
  sourceUserStoryId?: string | null;
  testCaseId?: string | null;
  deliveryVersionId?: string | null;
  sourceFingerprint?: string | null;
  testCaseSnapshotFingerprint?: string | null;
}) {
  const execution = await createQueuedAiExecutionRecord(db, input);

  if (!startTaskScheduler()) {
    await markWorkerStartFailure(execution.id, 1);
    revalidatePath("/execution-tasks");
    return {
      ok: false as const,
      message: "无法启动任务调度器，请查看服务日志",
    };
  }

  revalidatePath("/execution-tasks");
  return {
    ok: true as const,
    message: "AI 任务已进入队列",
    data: execution,
  };
}

export async function createAutomationScriptExecutionAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { user, project } = await getCurrentActionContext();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsed = createAutomationScriptExecutionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "测试用例 ID 不正确" };
  }
  if (!project.baseUrl) {
    return { ok: false, message: "请先在测试设置中配置 Base URL" };
  }

  const testCase = await db.testCase.findFirst({
    where: {
      id: parsed.data.testCaseId,
      projectId: project.id,
      deletedAt: null,
    },
    select: {
      id: true,
      code: true,
      name: true,
      preconditions: true,
      steps: true,
    },
  });
  if (!testCase) {
    return { ok: false, message: "测试用例不存在或已删除" };
  }

  const activeExecution = await db.aiExecution.findFirst({
    where: {
      projectId: project.id,
      testCaseId: testCase.id,
      capability: AiCapability.GENERATE_AUTOMATION_SCRIPT,
      status: {
        in: [AiExecutionStatus.QUEUED, AiExecutionStatus.RUNNING],
      },
      deletedAt: null,
    },
    select: { id: true },
  });
  if (activeExecution) {
    return {
      ok: false,
      message: "该用例已有脚本生成任务正在执行",
    };
  }

  return createQueuedExecution({
    projectId: project.id,
    requestedById: user.id,
    testCaseId: testCase.id,
    capability: AiCapability.GENERATE_AUTOMATION_SCRIPT,
    requirementText: formatAutomationScriptRequirement(testCase),
  });
}

export async function createAiUserStoryExecutionAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { user, project } = await getCurrentActionContext();
  const parsed = createAiUserStoryExecutionSchema.safeParse(input);
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

  return createQueuedExecution({
    projectId: project.id,
    requestedById: user.id,
    featureId: parsed.data.featureId,
    capability: AiCapability.GENERATE_USER_STORY,
    requirementText: parsed.data.requirementText,
  });
}

export async function createAiTestCaseExecutionAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { user, project } = await getCurrentActionContext();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsed = createAiTestCaseExecutionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查生成来源",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  if (parsed.data.sourceMode === "TEXT") {
    return createQueuedExecution({
      projectId: project.id,
      requestedById: user.id,
      capability: AiCapability.GENERATE_TEST_CASES,
      requirementText: parsed.data.requirementText.trim(),
    });
  }

  const userStoryId = parsed.data.userStoryId;
  if (!userStoryId) {
    return { ok: false, message: "请选择一个 US" };
  }

  const userStory = await db.userStory.findFirst({
    where: {
      id: userStoryId,
      projectId: project.id,
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      asA: true,
      iWant: true,
      soThat: true,
      businessRules: true,
      nonFunctionalRequirements: true,
      deliveryVersion: { select: { lockedAt: true, status: true } },
      acceptanceCriteria: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: {
          given: true,
          when: true,
          then: true,
        },
      },
      feature: {
        select: {
          name: true,
          summary: true,
          backgroundGoal: true,
        },
      },
      testCases: {
        where: { deletedAt: null },
        orderBy: { code: "asc" },
        select: {
          code: true,
          groupId: true,
          name: true,
          priority: true,
          preconditions: true,
          steps: true,
          enabled: true,
          updatedAt: true,
        },
      },
    },
  });
  if (!userStory) {
    return { ok: false, message: "所选 US 不存在或已删除" };
  }
  if (isDeliveryVersionContentLocked(userStory.deliveryVersion)) {
    return { ok: false, message: "所属交付版本已锁定，不能变更需求用例" };
  }

  const [activeExecution, pendingDraft] = await Promise.all([
    db.aiExecution.findFirst({
      where: {
        projectId: project.id,
        sourceUserStoryId: userStory.id,
        capability: AiCapability.GENERATE_TEST_CASES,
        status: { in: [AiExecutionStatus.QUEUED, AiExecutionStatus.RUNNING] },
        deletedAt: null,
      },
      select: { id: true },
    }),
    db.testCaseDraft.findFirst({
      where: {
        proposedUserStoryId: userStory.id,
        status: AiDraftStatus.PENDING,
        deletedAt: null,
        batch: { deletedAt: null },
      },
      select: { id: true },
    }),
  ]);
  if (activeExecution) {
    return { ok: false, message: "该 US 已有测试用例生成任务正在执行" };
  }
  if (pendingDraft) {
    return { ok: false, message: "该 US 已有待评审用例，请先完成评审" };
  }

  return createQueuedExecution({
    projectId: project.id,
    requestedById: user.id,
    sourceUserStoryId: userStory.id,
    capability: AiCapability.GENERATE_TEST_CASES,
    requirementText: formatUserStoryForTestCaseGeneration(userStory),
    sourceFingerprint: createUserStoryTestDesignFingerprint(userStory),
    testCaseSnapshotFingerprint: createTestCaseSetFingerprint(
      userStory.testCases,
    ),
  });
}

export async function createImplementationReviewExecutionAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { user, project } = await getCurrentActionContext();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsed = createImplementationReviewExecutionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "交付版本 ID 不正确" };
  }

  const version = await db.deliveryVersion.findFirst({
    where: {
      id: parsed.data.deliveryVersionId,
      projectId: project.id,
      deletedAt: null,
    },
    select: {
      id: true,
      code: true,
      name: true,
      _count: { select: { userStories: { where: { deletedAt: null } } } },
    },
  });
  if (!version) {
    return { ok: false, message: "交付版本不存在或已删除" };
  }
  if (version._count.userStories === 0) {
    return { ok: false, message: "当前交付版本没有可审查的 US" };
  }

  const created = await db.$transaction(async (transaction) => {
    const active = await transaction.aiExecution.findFirst({
      where: {
        projectId: project.id,
        capability: AiCapability.REVIEW_REQUIREMENT_IMPLEMENTATION,
        status: {
          in: [AiExecutionStatus.QUEUED, AiExecutionStatus.RUNNING],
        },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (active) return null;

    return createQueuedAiExecutionRecord(transaction, {
      projectId: project.id,
      requestedById: user.id,
      deliveryVersionId: version.id,
      capability: AiCapability.REVIEW_REQUIREMENT_IMPLEMENTATION,
      requirementText: `审查交付版本 ${version.code} · ${version.name} 中的需求是否被当前代码正确实现`,
    });
  });
  if (!created) {
    return { ok: false, message: "当前项目已有需求实现审查正在执行" };
  }

  if (!startTaskScheduler()) {
    await markWorkerStartFailure(created.id, 1);
    revalidatePath("/execution-tasks");
    return {
      ok: false,
      message: "无法启动任务调度器，请查看服务日志",
    };
  }

  revalidatePath("/execution-tasks");
  return {
    ok: true,
    message: "需求实现审查已进入队列",
    data: created,
  };
}

export async function retryExecutionTaskAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { user, project } = await getCurrentActionContext();
  const parsed = retryExecutionTaskSchema.safeParse(input);
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
        id: parsed.data.taskId,
        projectId: project.id,
        origin: AiExecutionOrigin.USER,
        deletedAt: null,
      },
      select: {
        status: true,
        capability: true,
        testCase: {
          select: {
            code: true,
            name: true,
            preconditions: true,
            steps: true,
          },
        },
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
    if (
      execution.capability === AiCapability.REVIEW_REQUIREMENT_IMPLEMENTATION
    ) {
      const activeReview = await transaction.aiExecution.findFirst({
        where: {
          id: { not: parsed.data.taskId },
          projectId: project.id,
          capability: AiCapability.REVIEW_REQUIREMENT_IMPLEMENTATION,
          status: {
            in: [AiExecutionStatus.QUEUED, AiExecutionStatus.RUNNING],
          },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (activeReview) {
        return {
          ok: false as const,
          message: "当前项目已有需求实现审查正在执行",
        };
      }
    }

    const updated = await transaction.aiExecution.updateMany({
      where: {
        id: parsed.data.taskId,
        projectId: project.id,
        origin: AiExecutionOrigin.USER,
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
        ...(execution.capability === AiCapability.GENERATE_AUTOMATION_SCRIPT &&
        execution.testCase
          ? {
              requirementText: formatAutomationScriptRequirement(
                execution.testCase,
              ),
            }
          : {}),
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
        executionId: parsed.data.taskId,
        position: logPosition,
        level: AiExecutionLogLevel.INFO,
        stage: AiExecutionStage.QUEUED,
        message: "任务已重新进入队列，等待 AI 执行器处理。",
        createdAt: retryAt,
      },
    });

    return {
      ok: true as const,
      id: parsed.data.taskId,
      nextLogPosition: logPosition + 1,
    };
  });
  if (!retryResult.ok) {
    return retryResult;
  }

  if (!startTaskScheduler()) {
    await markWorkerStartFailure(retryResult.id, retryResult.nextLogPosition);
    revalidatePath("/execution-tasks");
    revalidatePath(`/execution-tasks/${retryResult.id}`);
    return {
      ok: false,
      message: "无法启动任务调度器，请查看服务日志",
    };
  }

  revalidatePath("/execution-tasks");
  revalidatePath(`/execution-tasks/${retryResult.id}`);
  return {
    ok: true,
    message: "任务已重新进入队列",
    data: { id: retryResult.id },
  };
}

export async function deleteExecutionTaskAction(
  input: unknown,
): Promise<ActionResult> {
  const { project } = await getCurrentActionContext();
  const parsed = deleteExecutionTaskSchema.safeParse(input);
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }
  if (!parsed.success) {
    return { ok: false, message: "任务 ID 不正确" };
  }

  const execution = await db.aiExecution.findFirst({
    where: {
      id: parsed.data.taskId,
      projectId: project.id,
      origin: AiExecutionOrigin.USER,
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
      id: parsed.data.taskId,
      projectId: project.id,
      origin: AiExecutionOrigin.USER,
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

  revalidatePath("/execution-tasks");
  revalidatePath(`/execution-tasks/${parsed.data.taskId}`);
  return { ok: true, message: "执行任务已删除" };
}
