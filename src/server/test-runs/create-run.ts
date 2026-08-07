import "server-only";

import { createAutomationInputFingerprint } from "@/automation/fingerprint";
import { formatAutomationRunLog } from "@/automation/script-generation-run";
import { getAutomationScriptStatus } from "@/automation/script-status";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  AiCapability,
  AiExecutionOrigin,
  AiExecutionLogLevel,
  AiExecutionStage,
  AiExecutionStatus,
  RunStatus,
  TestRunStage,
} from "@/generated/prisma/enums";
import { VariableReferenceError } from "@/lib/project-variables/references";
import {
  createQueuedAiExecutionRecord,
  formatAutomationScriptRequirement,
} from "@/server/tasks/ai-execution-record";

type RunDatabase = PrismaClient | Prisma.TransactionClient;

const ARTIFACT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export class TestRunCreationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "TestRunCreationError";
  }
}

export async function createQueuedTestRun(
  database: RunDatabase,
  input: {
    projectId: string;
    testCaseId: string;
    requestedById: string;
    baseUrl: string;
  },
) {
  const testCase = await database.testCase.findFirst({
    where: {
      id: input.testCaseId,
      projectId: input.projectId,
      deletedAt: null,
    },
    select: {
      id: true,
      code: true,
      name: true,
      enabled: true,
      script: true,
      scriptSource: true,
      aiScriptFingerprint: true,
      preconditions: true,
      steps: true,
      project: {
        select: {
          automationInstructions: true,
          variables: {
            where: { deletedAt: null },
            orderBy: { position: "asc" },
            select: {
              name: true,
              kind: true,
              encrypted: true,
              description: true,
              fields: {
                orderBy: { position: "asc" },
                select: {
                  name: true,
                  kind: true,
                  encrypted: true,
                  description: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!testCase) {
    throw new TestRunCreationError("测试用例不存在或已删除", 404);
  }
  if (!testCase.enabled) {
    throw new TestRunCreationError("测试用例已停用，不能运行", 400);
  }

  const activeRun = await database.testRun.findFirst({
    where: {
      testCaseId: testCase.id,
      status: { in: [RunStatus.QUEUED, RunStatus.RUNNING] },
      deletedAt: null,
    },
    select: { id: true },
  });
  if (activeRun) {
    throw new TestRunCreationError(
      `用例 ${testCase.code} 正在执行，请等待当前任务完成`,
      409,
    );
  }

  let fingerprint: string;
  try {
    fingerprint = createAutomationInputFingerprint({
      testCase,
      baseUrl: input.baseUrl,
      automationInstructions: testCase.project.automationInstructions,
      variables: testCase.project.variables,
    });
  } catch (error) {
    if (error instanceof VariableReferenceError) {
      throw new TestRunCreationError(
        `测试用例变量引用无效：${error.message}`,
        400,
      );
    }
    throw error;
  }

  const scriptStatus = getAutomationScriptStatus({
    script: testCase.script,
    source: testCase.scriptSource,
    aiFingerprint: testCase.aiScriptFingerprint,
    currentFingerprint: fingerprint,
  });
  const scriptSnapshot =
    scriptStatus === "NOT_GENERATED" || scriptStatus === "STALE"
      ? null
      : testCase.script;
  const needsScriptGeneration = scriptSnapshot === null;

  if (needsScriptGeneration) {
    const activeScriptTask = await database.aiExecution.findFirst({
      where: {
        projectId: input.projectId,
        testCaseId: testCase.id,
        capability: AiCapability.GENERATE_AUTOMATION_SCRIPT,
        status: { in: [AiExecutionStatus.QUEUED, AiExecutionStatus.RUNNING] },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (activeScriptTask) {
      throw new TestRunCreationError(
        `用例 ${testCase.code} 的 AI 脚本生成任务正在执行`,
        409,
      );
    }
  }

  const scriptTask = needsScriptGeneration
    ? await createQueuedAiExecutionRecord(database, {
        projectId: input.projectId,
        requestedById: input.requestedById,
        testCaseId: testCase.id,
        capability: AiCapability.GENERATE_AUTOMATION_SCRIPT,
        origin: AiExecutionOrigin.TEST_RUN,
        requirementText: formatAutomationScriptRequirement(testCase),
      })
    : null;
  const run = await database.testRun.create({
    data: {
      testCaseId: testCase.id,
      requestedById: input.requestedById,
      status: RunStatus.QUEUED,
      stage: needsScriptGeneration
        ? TestRunStage.GENERATING_SCRIPT
        : TestRunStage.QUEUED,
      artifactsExpireAt: new Date(Date.now() + ARTIFACT_RETENTION_MS),
      testCaseCodeSnapshot: testCase.code,
      testCaseNameSnapshot: testCase.name,
      scriptSnapshot,
      baseUrlSnapshot: input.baseUrl,
      logContent: needsScriptGeneration
        ? formatAutomationRunLog(
            "INFO",
            "生成自动化脚本",
            "运行任务已创建，等待 AI 脚本任务开始。",
          )
        : null,
    },
    select: { id: true, status: true },
  });

  return { run, scriptTaskId: scriptTask?.id ?? null };
}

export async function failQueuedRunsAfterSchedulerError(
  database: RunDatabase,
  input: { runIds: string[]; scriptTaskIds: string[] },
) {
  const finishedAt = new Date();
  await database.testRun.updateMany({
    where: { id: { in: input.runIds }, status: RunStatus.QUEUED },
    data: {
      status: RunStatus.FAILED,
      stage: TestRunStage.COMPLETED,
      finishedAt,
      errorSummary: "无法启动任务调度器",
    },
  });
  for (const taskId of input.scriptTaskIds) {
    await database.aiExecution.update({
      where: { id: taskId },
      data: {
        status: AiExecutionStatus.FAILED,
        stage: AiExecutionStage.QUEUED,
        finishedAt,
        errorMessage: "无法启动任务调度器",
        logs: {
          create: {
            position: 1,
            level: AiExecutionLogLevel.ERROR,
            stage: AiExecutionStage.QUEUED,
            message: "任务失败（SCHEDULER_START）：无法启动任务调度器。",
            createdAt: finishedAt,
          },
        },
      },
    });
  }
}
