import { ModelProviderError } from "@/ai/model-provider";
import { RepositoryCodeError } from "@/ai/repository-code-source";
import { AiWorkflowError } from "@/ai/workflow";
import { AutomationAgentError } from "@/automation/agent";
import { AutomationAuthenticationError } from "@/automation/authentication";
import { PlaywrightCliError } from "@/automation/playwright-cli-session";
import { AutomationScriptValidationError } from "@/automation/script-validator";
import { appendPendingScriptGenerationRunLog } from "@/automation/script-generation-run";
import type { Prisma } from "@/generated/prisma/client";
import {
  AiCapability,
  AiExecutionOrigin,
  AiExecutionLogLevel,
  AiExecutionStage,
  AiExecutionStatus,
} from "@/generated/prisma/enums";
import { taskDb } from "@/task-runtime/runtime";

const OWNERSHIP_POLL_INTERVAL_MS = 500;

export class TaskOwnershipLostError extends Error {
  constructor() {
    super("AI 任务执行权已失效");
    this.name = "TaskOwnershipLostError";
  }
}

export function getSafeTaskError(error: unknown, timeoutSignal: AbortSignal) {
  if (timeoutSignal.aborted) {
    return {
      code: "TASK_TIMEOUT",
      message: "AI 任务运行超过允许时长，已自动终止",
    };
  }
  if (error instanceof ModelProviderError) {
    return { code: `MODEL_${error.code}`, message: error.message };
  }
  if (error instanceof RepositoryCodeError) {
    return { code: `REPOSITORY_${error.code}`, message: error.message };
  }
  if (error instanceof AiWorkflowError) {
    return { code: "WORKFLOW", message: error.message };
  }
  if (error instanceof AutomationAgentError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof AutomationAuthenticationError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof PlaywrightCliError) {
    return { code: `PLAYWRIGHT_CLI_${error.code}`, message: error.message };
  }
  if (error instanceof AutomationScriptValidationError) {
    return { code: "SCRIPT_VALIDATION", message: error.message };
  }
  return {
    code: "UNEXPECTED",
    message: "AI 任务执行失败，请稍后重试",
  };
}

function getStageStartedMessage(
  capability: AiCapability,
  stage: AiExecutionStage,
) {
  switch (stage) {
    case AiExecutionStage.CHECKING_REPOSITORIES:
      return "正在检查并读取项目代码仓库。";
    case AiExecutionStage.SELECTING_CODE:
      return "正在根据需求定位相关代码。";
    case AiExecutionStage.GENERATING_DRAFT:
      if (capability === AiCapability.GENERATE_USER_STORY) {
        return "正在根据需求和代码生成结构化 US 草稿。";
      }
      if (capability === AiCapability.CHECK_CONSISTENCY) {
        return "正在比较正式内容与当前代码。";
      }
      return "正在根据需求和代码生成自然语言测试用例草稿。";
    case AiExecutionStage.PROBING_PAGE:
      return "正在使用独立浏览器会话探测真实页面。";
    case AiExecutionStage.PREPARING_AUTHENTICATION:
      return "正在调用项目登录方法准备页面探测环境。";
    case AiExecutionStage.GENERATING_SCRIPT:
      return "正在检查代码实现并生成自动化脚本。";
    case AiExecutionStage.VALIDATING_SCRIPT:
      return "正在执行 Playwright 编译与测试发现检查。";
    case AiExecutionStage.COMPLETED:
      return "AI 任务已完成。";
    case AiExecutionStage.QUEUED:
      return "任务正在等待执行。";
  }
}

export async function createAiTaskReporter(input: {
  executionId: string;
  ownerId: string;
  capability: AiCapability;
  origin: AiExecutionOrigin;
  testCaseId: string | null;
  initialStage: AiExecutionStage;
}) {
  const latestLog = await taskDb.aiExecutionLog.findFirst({
    where: { executionId: input.executionId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  let nextPosition = (latestLog?.position ?? -1) + 1;
  let currentStage = input.initialStage;
  let writeQueue = Promise.resolve();

  const writeLog = (
    level: AiExecutionLogLevel,
    stage: AiExecutionStage,
    message: string,
  ) => {
    // Agent 同一步可能并行完成多个工具调用；串行写入才能保证日志序号稳定且不冲突。
    const write = writeQueue.then(async () => {
      await taskDb.$transaction(async (transaction) => {
        const owned = await transaction.aiExecution.findFirst({
          where: {
            id: input.executionId,
            status: AiExecutionStatus.RUNNING,
            workerId: input.ownerId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!owned) throw new TaskOwnershipLostError();

        await transaction.aiExecutionLog.create({
          data: {
            executionId: input.executionId,
            position: nextPosition,
            level,
            stage,
            message,
          },
        });
        if (
          input.capability === AiCapability.GENERATE_AUTOMATION_SCRIPT &&
          input.origin === AiExecutionOrigin.TEST_RUN &&
          input.testCaseId
        ) {
          await appendPendingScriptGenerationRunLog(transaction, {
            testCaseId: input.testCaseId,
            level,
            stage: AiExecutionStage[stage],
            message,
          });
        }
      });
      nextPosition += 1;
    });
    writeQueue = write.catch(() => undefined);
    return write;
  };

  return {
    get currentStage() {
      return currentStage;
    },
    writeLog,
    async updateStage(stage: AiExecutionStage) {
      const updated = await taskDb.aiExecution.updateMany({
        where: {
          id: input.executionId,
          status: AiExecutionStatus.RUNNING,
          workerId: input.ownerId,
        },
        data: { stage },
      });
      if (updated.count !== 1) throw new TaskOwnershipLostError();

      currentStage = stage;
      await writeLog(
        AiExecutionLogLevel.INFO,
        stage,
        getStageStartedMessage(input.capability, stage),
      );
    },
  };
}

export type AiTaskReporter = Awaited<ReturnType<typeof createAiTaskReporter>>;

export async function appendCompletionLog(
  transaction: Prisma.TransactionClient,
  executionId: string,
  message: string,
) {
  const latest = await transaction.aiExecutionLog.findFirst({
    where: { executionId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  await transaction.aiExecutionLog.create({
    data: {
      executionId,
      position: (latest?.position ?? -1) + 1,
      level: AiExecutionLogLevel.INFO,
      stage: AiExecutionStage.COMPLETED,
      message,
    },
  });
}

export function watchAiTaskOwnership(executionId: string, ownerId: string) {
  const controller = new AbortController();
  let checkRunning = false;
  const timer = setInterval(() => {
    if (checkRunning) return;
    checkRunning = true;
    void taskDb.aiExecution
      .findUnique({
        where: { id: executionId },
        select: { status: true, workerId: true, deletedAt: true },
      })
      .then((current) => {
        if (
          !current ||
          current.status !== AiExecutionStatus.RUNNING ||
          current.workerId !== ownerId ||
          current.deletedAt
        ) {
          controller.abort();
        }
      })
      .catch(() => undefined)
      .finally(() => {
        checkRunning = false;
      });
  }, OWNERSHIP_POLL_INTERVAL_MS);

  return {
    signal: controller.signal,
    stop() {
      clearInterval(timer);
    },
  };
}
