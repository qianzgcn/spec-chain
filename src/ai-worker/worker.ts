import { builtInSkillResolver } from "@/ai/skills";
import { AiWorkflowError } from "@/ai/workflow";
import { executeAutomationScriptTask } from "@/ai-worker/automation-task";
import { executeRepositoryTask } from "@/ai-worker/repository-task";
import {
  findAiTaskExecution,
  findAiTaskModelBinding,
  type AiTaskExecution,
} from "@/ai-worker/task-data";
import {
  createAiTaskReporter,
  getSafeTaskError,
  type AiTaskReporter,
  TaskOwnershipLostError,
  watchAiTaskOwnership,
} from "@/ai-worker/task-support";
import {
  AiCapability,
  AiExecutionOrigin,
  AiExecutionLogLevel,
  AiExecutionStatus,
} from "@/generated/prisma/enums";
import { failPendingScriptGenerationRun } from "@/automation/script-generation-run";
import { decryptTaskSecret, taskDb } from "@/task-runtime/runtime";

const TASK_TIMEOUT_MS = 10 * 60 * 1_000;

function getCapabilityName(capability: AiCapability) {
  switch (capability) {
    case AiCapability.GENERATE_USER_STORY:
      return "生成 US";
    case AiCapability.GENERATE_TEST_CASES:
      return "生成测试用例";
    case AiCapability.GENERATE_AUTOMATION_SCRIPT:
      return "生成自动化脚本";
  }
}

function validateTaskInput(execution: AiTaskExecution) {
  if (
    execution.capability === AiCapability.GENERATE_USER_STORY &&
    execution.featureId &&
    (!execution.feature || execution.feature.deletedAt)
  ) {
    throw new AiWorkflowError("所属 FE 不存在或已删除");
  }
}

async function loadTaskModelContext(input: {
  execution: AiTaskExecution;
  ownerId: string;
  reporter: AiTaskReporter;
}) {
  const binding = await findAiTaskModelBinding(input.execution.capability);
  if (!binding || binding.modelProfile.deletedAt) {
    throw new AiWorkflowError(
      `管理员尚未配置${getCapabilityName(input.execution.capability)}的默认模型`,
    );
  }

  let modelApiKey: string;
  try {
    modelApiKey = decryptTaskSecret(binding.modelProfile.apiKeyEncrypted);
  } catch {
    throw new AiWorkflowError(
      "默认模型的 API Key 无法读取，请联系管理员重新配置",
    );
  }

  const skill = builtInSkillResolver.resolve(input.execution.capability);
  const snapshotUpdated = await taskDb.aiExecution.updateMany({
    where: {
      id: input.execution.id,
      status: AiExecutionStatus.RUNNING,
      workerId: input.ownerId,
    },
    data: {
      modelProfileNameSnapshot: binding.modelProfile.name,
      modelIdSnapshot: binding.modelProfile.modelId,
      skillNameSnapshot: skill.name,
      skillVersionSnapshot: skill.version,
    },
  });
  if (snapshotUpdated.count !== 1) throw new TaskOwnershipLostError();

  await input.reporter.writeLog(
    AiExecutionLogLevel.INFO,
    input.reporter.currentStage,
    `已加载模型 ${binding.modelProfile.modelId}。`,
  );
  return { binding, modelApiKey };
}

async function executeTask(executionId: string, ownerId: string) {
  const execution = await findAiTaskExecution(executionId);
  if (
    !execution ||
    execution.status !== AiExecutionStatus.RUNNING ||
    execution.workerId !== ownerId
  ) {
    return;
  }

  const reporter = await createAiTaskReporter({
    executionId: execution.id,
    ownerId,
    capability: execution.capability,
    origin: execution.origin,
    testCaseId: execution.testCaseId,
    initialStage: execution.stage,
  });
  const timeoutSignal = AbortSignal.timeout(TASK_TIMEOUT_MS);
  const ownership = watchAiTaskOwnership(execution.id, ownerId);
  const taskSignal = AbortSignal.any([timeoutSignal, ownership.signal]);
  const startedAt = execution.startedAt ?? new Date();

  try {
    await reporter.writeLog(
      AiExecutionLogLevel.INFO,
      reporter.currentStage,
      "AI 执行器已开始处理任务。",
    );
    validateTaskInput(execution);
    const { binding, modelApiKey } = await loadTaskModelContext({
      execution,
      ownerId,
      reporter,
    });

    const taskInput = {
      execution,
      ownerId,
      binding,
      modelApiKey,
      startedAt,
      abortSignal: taskSignal,
      reporter,
    };
    if (execution.capability === AiCapability.GENERATE_AUTOMATION_SCRIPT) {
      await executeAutomationScriptTask(taskInput);
    } else {
      await executeRepositoryTask(taskInput);
    }
  } catch (error) {
    if (error instanceof TaskOwnershipLostError || ownership.signal.aborted) {
      return;
    }

    const finishedAt = new Date();
    const safeError = getSafeTaskError(error, timeoutSignal);
    await reporter
      .writeLog(
        AiExecutionLogLevel.ERROR,
        reporter.currentStage,
        `任务失败（${safeError.code}）：${safeError.message}`,
      )
      .catch(() => undefined);
    await taskDb.$transaction(async (transaction) => {
      const failed = await transaction.aiExecution.updateMany({
        where: {
          id: execution.id,
          status: AiExecutionStatus.RUNNING,
          workerId: ownerId,
        },
        data: {
          status: AiExecutionStatus.FAILED,
          errorMessage: safeError.message,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          workerId: null,
        },
      });
      if (
        failed.count === 1 &&
        execution.capability === AiCapability.GENERATE_AUTOMATION_SCRIPT &&
        execution.origin === AiExecutionOrigin.TEST_RUN &&
        execution.testCaseId
      ) {
        await failPendingScriptGenerationRun(
          transaction,
          execution.testCaseId,
          safeError.message,
        );
      }
    });
  } finally {
    ownership.stop();
  }
}

async function main() {
  const [executionId, workerId] = process.argv.slice(2);
  if (!executionId || !workerId) {
    throw new Error("缺少 AI 任务 ID 或 Worker ID");
  }
  await executeTask(executionId, workerId);
}

void main()
  .catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await taskDb.$disconnect();
  });
