import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { createCompatibleLanguageModel } from "@/ai/model-provider";
import type {
  AiTaskExecution,
  AiTaskModelBinding,
} from "@/ai-worker/task-data";
import {
  appendCompletionLog,
  type AiTaskReporter,
  TaskOwnershipLostError,
} from "@/ai-worker/task-support";
import { createAutomationInputFingerprint } from "@/automation/fingerprint";
import {
  generateAutomationScript,
  type AutomationGenerationStage,
} from "@/automation/workflow";
import {
  AiExecutionStage,
  AiExecutionStatus,
  VariableKind,
} from "@/generated/prisma/enums";
import { AiWorkflowError } from "@/ai/workflow";
import { decryptTaskSecret, taskDb, taskRuntime } from "@/task-runtime/runtime";

export async function executeAutomationScriptTask(input: {
  execution: AiTaskExecution;
  ownerId: string;
  binding: AiTaskModelBinding;
  modelApiKey: string;
  startedAt: Date;
  abortSignal: AbortSignal;
  reporter: AiTaskReporter;
}) {
  const { execution } = input;
  const testCase = execution.testCase;
  const baseUrl = execution.project.baseUrl;

  if (!execution.testCaseId || !testCase) {
    throw new AiWorkflowError("自动化脚本生成任务没有关联测试用例");
  }
  if (testCase.deletedAt) {
    throw new AiWorkflowError("测试用例不存在或已删除");
  }
  if (!baseUrl) {
    throw new AiWorkflowError("当前项目尚未配置 Base URL");
  }

  const variables = execution.project.variables.map((variable) => {
    try {
      return {
        name: variable.name,
        kind: variable.kind,
        description: variable.description,
        value:
          variable.kind === VariableKind.SECRET
            ? decryptTaskSecret(variable.value)
            : variable.value,
      };
    } catch {
      throw new AiWorkflowError(
        `项目变量 ${variable.name} 无法读取，请重新配置`,
      );
    }
  });
  const fingerprint = createAutomationInputFingerprint({
    testCase,
    baseUrl,
    automationInstructions: execution.project.automationInstructions,
    variables,
  });
  const workDir = path.join(taskRuntime.dataDir, "automation", execution.id);
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  try {
    const result = await generateAutomationScript({
      taskId: execution.id,
      workDir,
      model: createCompatibleLanguageModel({
        name: input.binding.modelProfile.name,
        baseUrl: input.binding.modelProfile.baseUrl,
        modelId: input.binding.modelProfile.modelId,
        apiKey: input.modelApiKey,
      }),
      baseUrl,
      automationInstructions: execution.project.automationInstructions,
      variables,
      testCase,
      abortSignal: input.abortSignal,
      onStage: (stage: AutomationGenerationStage) =>
        input.reporter.updateStage(AiExecutionStage[stage]),
      onLog: (message) =>
        input.reporter.writeLog("INFO", input.reporter.currentStage, message),
    });
    const finishedAt = new Date();

    await taskDb.$transaction(async (transaction) => {
      const saved = await transaction.testCase.updateMany({
        where: {
          id: testCase.id,
          projectId: execution.projectId,
          deletedAt: null,
          updatedAt: testCase.updatedAt,
          script: testCase.script,
        },
        data: {
          script: result.script,
          scriptSource: "AI",
          aiScriptFingerprint: fingerprint,
          scriptGeneratedAt: finishedAt,
        },
      });
      if (saved.count !== 1) {
        throw new AiWorkflowError(
          "生成期间测试用例或脚本已被修改，未覆盖现有内容，请重新发起",
        );
      }

      const completed = await transaction.aiExecution.updateMany({
        where: {
          id: execution.id,
          status: AiExecutionStatus.RUNNING,
          workerId: input.ownerId,
        },
        data: {
          status: AiExecutionStatus.SUCCEEDED,
          stage: AiExecutionStage.COMPLETED,
          promptTokens: result.usage.inputTokens,
          completionTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
          finishedAt,
          durationMs: finishedAt.getTime() - input.startedAt.getTime(),
          workerId: null,
        },
      });
      if (completed.count !== 1) throw new TaskOwnershipLostError();

      await appendCompletionLog(
        transaction,
        execution.id,
        "任务处理完成，自动化脚本已保存到测试用例。",
      );
    });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
