import path from "node:path";

import {
  ModelProviderError,
  createCompatibleLanguageModel,
} from "@/ai/model-provider";
import { builtInSkillResolver } from "@/ai/skills";
import { AutomationAgentError } from "@/automation/agent";
import {
  AutomationAuthenticationError,
  type ResolvedAutomationAuthentication,
} from "@/automation/authentication";
import { createAutomationInputFingerprint } from "@/automation/fingerprint";
import { PlaywrightCliError } from "@/automation/playwright-cli-session";
import { AutomationScriptValidationError } from "@/automation/script-validator";
import type { ResolvedProjectVariables } from "@/automation/variable-runtime";
import {
  generateAutomationScript,
  type AutomationGenerationStage,
} from "@/automation/workflow";
import {
  AiCapability,
  RunStatus,
  TestRunStage,
} from "@/generated/prisma/enums";
import type { RunnerTestRun } from "@/runner/run-data";
import type { RunLogWriter } from "@/runner/run-log-writer";
import { decryptTaskSecret, taskDb } from "@/task-runtime/runtime";

const GENERATION_TIMEOUT_MS = 10 * 60 * 1_000;

export class ScriptGenerationTimeoutError extends Error {
  constructor() {
    super("自动化脚本生成超过 10 分钟，已自动终止");
    this.name = "ScriptGenerationTimeoutError";
  }
}

export class RunStoppedError extends Error {
  constructor() {
    super("运行已由用户停止");
    this.name = "RunStoppedError";
  }
}

export function getAutomationGenerationErrorMessage(error: unknown) {
  if (
    error instanceof ModelProviderError ||
    error instanceof AutomationAgentError ||
    error instanceof AutomationAuthenticationError ||
    error instanceof PlaywrightCliError ||
    error instanceof AutomationScriptValidationError
  ) {
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : "自动化脚本生成失败，请稍后重试";
}

function getStageMessage(stage: AutomationGenerationStage) {
  switch (stage) {
    case "PROBING_PAGE":
      return {
        label: "探测真实页面",
        message: "正在使用独立的无头 Chromium 会话探测真实页面。",
      };
    case "PREPARING_AUTHENTICATION":
      return {
        label: "准备登录环境",
        message: "正在调用项目登录方法准备页面探测环境。",
      };
    case "GENERATING_SCRIPT":
      return {
        label: "生成自动化脚本",
        message: "模型已提交脚本，正在进行静态安全检查。",
      };
    case "VALIDATING_SCRIPT":
      return {
        label: "校验自动化脚本",
        message: "正在执行 Playwright 编译与测试发现检查。",
      };
  }
}

export async function generateScriptForRun(input: {
  run: RunnerTestRun;
  workerId: string;
  variables: ResolvedProjectVariables;
  authentication: ResolvedAutomationAuthentication | null;
  workDir: string;
  stopSignal: AbortSignal;
  logger: RunLogWriter;
}) {
  const binding = await taskDb.aiCapabilityBinding.findUnique({
    where: { capability: AiCapability.GENERATE_AUTOMATION_SCRIPT },
    include: { modelProfile: true },
  });
  if (!binding || binding.modelProfile.deletedAt) {
    throw new Error("管理员尚未配置生成自动化脚本的默认模型");
  }

  let modelApiKey: string;
  try {
    modelApiKey = decryptTaskSecret(binding.modelProfile.apiKeyEncrypted);
  } catch {
    throw new Error("默认模型的 API Key 无法读取，请联系管理员重新配置");
  }

  const skill = builtInSkillResolver.resolve(
    AiCapability.GENERATE_AUTOMATION_SCRIPT,
  );
  await taskDb.testRun.updateMany({
    where: {
      id: input.run.id,
      status: RunStatus.RUNNING,
      workerId: input.workerId,
    },
    data: {
      modelProfileNameSnapshot: binding.modelProfile.name,
      modelIdSnapshot: binding.modelProfile.modelId,
      skillNameSnapshot: skill.name,
      skillVersionSnapshot: skill.version,
    },
  });
  input.logger.appendTaskLog(
    "INFO",
    "生成自动化脚本",
    `已加载模型配置“${binding.modelProfile.name}”（${binding.modelProfile.modelId}）。`,
  );

  const fingerprint = createAutomationInputFingerprint({
    testCase: input.run.testCase,
    baseUrl: input.run.baseUrlSnapshot,
    automationInstructions: input.run.testCase.project.automationInstructions,
    variables: input.variables.metadata,
  });
  const timeoutSignal = AbortSignal.timeout(GENERATION_TIMEOUT_MS);
  const generationSignal = AbortSignal.any([input.stopSignal, timeoutSignal]);

  let generated;
  try {
    generated = await generateAutomationScript({
      taskId: input.run.id,
      workDir: path.join(input.workDir, "generation"),
      model: createCompatibleLanguageModel({
        name: binding.modelProfile.name,
        baseUrl: binding.modelProfile.baseUrl,
        modelId: binding.modelProfile.modelId,
        apiKey: modelApiKey,
      }),
      baseUrl: input.run.baseUrlSnapshot,
      automationInstructions: input.run.testCase.project.automationInstructions,
      authentication: input.authentication,
      variableMetadata: input.variables.metadata,
      variableValues: input.variables.values,
      testCase: input.run.testCase,
      abortSignal: generationSignal,
      onStage: async (stage) => {
        await taskDb.testRun.updateMany({
          where: {
            id: input.run.id,
            status: RunStatus.RUNNING,
            workerId: input.workerId,
          },
          data: { stage: TestRunStage[stage] },
        });
        const stageMessage = getStageMessage(stage);
        input.logger.appendTaskLog(
          "INFO",
          stageMessage.label,
          stageMessage.message,
        );
      },
      onLog: (message) =>
        input.logger.appendTaskLog("INFO", "页面探测", message),
    });
  } catch (error) {
    if (timeoutSignal.aborted && !input.stopSignal.aborted) {
      throw new ScriptGenerationTimeoutError();
    }
    throw error;
  }

  const generatedAt = new Date();
  await taskDb.$transaction(async (transaction) => {
    const saved = await transaction.testCase.updateMany({
      where: {
        id: input.run.testCase.id,
        deletedAt: null,
        updatedAt: input.run.testCase.updatedAt,
        script: input.run.testCase.script,
      },
      data: {
        script: generated.script,
        scriptSource: "AI",
        aiScriptFingerprint: fingerprint,
        scriptGeneratedAt: generatedAt,
      },
    });
    if (saved.count !== 1) {
      throw new Error(
        "生成期间测试用例或脚本已被修改，未覆盖现有内容，请重新运行",
      );
    }

    const updatedRun = await transaction.testRun.updateMany({
      where: {
        id: input.run.id,
        status: RunStatus.RUNNING,
        workerId: input.workerId,
        cancelRequestedAt: null,
      },
      data: {
        scriptSnapshot: generated.script,
        generatedScriptInRun: true,
        promptTokens: generated.usage.inputTokens,
        completionTokens: generated.usage.outputTokens,
        totalTokens: generated.usage.totalTokens,
      },
    });
    if (updatedRun.count !== 1) {
      throw new RunStoppedError();
    }
  });

  input.logger.appendTaskLog(
    "INFO",
    "生成自动化脚本",
    "自动化脚本已通过校验并保存，本次任务将直接执行一次。",
  );
  return generated.script;
}
