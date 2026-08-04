import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import {
  createCompatibleLanguageModel,
  createModelProvider,
} from "@/ai/model-provider";
import { resolveProjectRepositories } from "@/ai/repository-access";
import { createRepositoryCodeSource } from "@/ai/repository-code-source";
import type {
  AiTaskExecution,
  AiTaskModelBinding,
} from "@/ai-worker/task-data";
import {
  appendCompletionLog,
  type AiTaskReporter,
  TaskOwnershipLostError,
} from "@/ai-worker/task-support";
import { resolveAutomationAuthentication } from "@/automation/authentication";
import {
  addModelUsage,
  checkAutomationCodeReadiness,
} from "@/automation/code-readiness";
import { createAutomationInputFingerprint } from "@/automation/fingerprint";
import {
  ProjectVariableRuntimeError,
  resolveProjectVariables,
  type ResolvedProjectVariables,
} from "@/automation/variable-runtime";
import {
  generateAutomationScript,
  type AutomationGenerationStage,
} from "@/automation/workflow";
import {
  AiExecutionLogLevel,
  AiExecutionOrigin,
  AiExecutionStage,
  AiExecutionStatus,
} from "@/generated/prisma/enums";
import { AiWorkflowError } from "@/ai/workflow";
import {
  validateTestCaseVariableReferences,
  VariableReferenceError,
  type ValidatedVariableReferences,
} from "@/lib/project-variables/references";
import { attachGeneratedScriptToPendingRun } from "@/automation/script-generation-run";
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

  await input.reporter.updateStage(AiExecutionStage.GENERATING_SCRIPT);
  const modelConfig = {
    name: input.binding.modelProfile.name,
    baseUrl: input.binding.modelProfile.baseUrl,
    modelId: input.binding.modelProfile.modelId,
    apiKey: input.modelApiKey,
  };
  const codeReadiness = await checkAutomationCodeReadiness({
    testCase,
    repositories: resolveProjectRepositories(
      execution.project,
      decryptTaskSecret,
    ),
    modelProvider: createModelProvider(modelConfig),
    repositoryCodeSource: createRepositoryCodeSource(),
    abortSignal: input.abortSignal,
    onStage: input.reporter.updateStage,
    onLog: (event) =>
      input.reporter.writeLog(
        event.level === "WARN"
          ? AiExecutionLogLevel.WARN
          : AiExecutionLogLevel.INFO,
        event.stage,
        event.message,
      ),
  });
  const snapshotUpdated = await taskDb.aiExecution.updateMany({
    where: {
      id: execution.id,
      status: AiExecutionStatus.RUNNING,
      workerId: input.ownerId,
    },
    data: {
      repositorySnapshot: JSON.stringify(codeReadiness.repositories),
      codeReferences: JSON.stringify(codeReadiness.codeReferences),
    },
  });
  if (snapshotUpdated.count !== 1) throw new TaskOwnershipLostError();
  await input.reporter.writeLog(
    AiExecutionLogLevel.INFO,
    AiExecutionStage.GENERATING_SCRIPT,
    `代码预检通过，已读取 ${codeReadiness.codeEvidence.length} 个相关源码文件，开始探测真实页面。`,
  );

  let variables: ResolvedProjectVariables;
  try {
    variables = resolveProjectVariables(
      execution.project.variables,
      decryptTaskSecret,
    );
  } catch (error) {
    if (error instanceof ProjectVariableRuntimeError) {
      throw new AiWorkflowError(error.message);
    }
    throw error;
  }
  let references: ValidatedVariableReferences;
  try {
    references = validateTestCaseVariableReferences({
      preconditions: testCase.preconditions,
      steps: testCase.steps,
      variables: variables.metadata,
    });
  } catch (error) {
    if (error instanceof VariableReferenceError) {
      throw new AiWorkflowError(`测试用例变量引用无效：${error.message}`);
    }
    throw error;
  }
  const authentication = resolveAutomationAuthentication({
    loginMethodSource: execution.project.loginMethodSource,
    credentialVariableName: references.credentialVariableName,
    variableValues: variables.values,
  });
  const fingerprint = createAutomationInputFingerprint({
    testCase,
    baseUrl,
    automationInstructions: execution.project.automationInstructions,
    variables: variables.metadata,
  });
  const workDir = path.join(taskRuntime.dataDir, "automation", execution.id);
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  try {
    const result = await generateAutomationScript({
      taskId: execution.id,
      workDir,
      model: createCompatibleLanguageModel(modelConfig),
      baseUrl,
      automationInstructions: execution.project.automationInstructions,
      authentication,
      variableMetadata: variables.metadata,
      variableValues: variables.values,
      codeEvidence: codeReadiness.codeEvidence,
      testCase,
      abortSignal: input.abortSignal,
      onStage: (stage: AutomationGenerationStage) =>
        input.reporter.updateStage(AiExecutionStage[stage]),
      onLog: (message) =>
        input.reporter.writeLog("INFO", input.reporter.currentStage, message),
    });
    const finishedAt = new Date();
    addModelUsage(result.usage, codeReadiness.usage);

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

      if (execution.origin === AiExecutionOrigin.TEST_RUN) {
        await attachGeneratedScriptToPendingRun(transaction, {
          testCaseId: testCase.id,
          script: result.script,
          promptTokens: result.usage.inputTokens,
          completionTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
        });
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
