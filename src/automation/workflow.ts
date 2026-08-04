import path from "node:path";

import type { LanguageModel } from "ai";

import { runAutomationScriptAgent } from "@/automation/agent";
import {
  prepareAuthenticationState,
  type ResolvedAutomationAuthentication,
} from "@/automation/authentication";
import type { AutomationVariableMetadata } from "@/automation/fingerprint";
import { PlaywrightCliSession } from "@/automation/playwright-cli-session";
import {
  buildAutomationScriptPrompt,
  generateAutomationScriptSystemPrompt,
} from "@/automation/prompts";
import {
  requiresIsolatedTestData,
  validateAutomationScriptCompilation,
  validateAutomationScriptStatic,
} from "@/automation/script-validator";
import { createVariableRuntimeBundle } from "@/automation/variable-runtime";
import type { ModelUsage } from "@/ai/model-provider";
import type { CodeEvidence } from "@/ai/relevant-code";

export type AutomationGenerationStage =
  | "PREPARING_AUTHENTICATION"
  | "PROBING_PAGE"
  | "GENERATING_SCRIPT"
  | "VALIDATING_SCRIPT";

export type AutomationScriptWorkflowInput = {
  taskId: string;
  workDir: string;
  model: LanguageModel;
  baseUrl: string;
  automationInstructions: string | null;
  authentication: ResolvedAutomationAuthentication | null;
  variableMetadata: AutomationVariableMetadata[];
  variableValues: Readonly<Record<string, string>>;
  codeEvidence: readonly CodeEvidence[];
  testCase: {
    code: string;
    name: string;
    preconditions: string | null;
    steps: string;
  };
  abortSignal: AbortSignal;
  onStage?: (stage: AutomationGenerationStage) => void | Promise<void>;
  onLog?: (message: string) => void | Promise<void>;
};

export type AutomationScriptWorkflowResult = {
  script: string;
  usage: ModelUsage;
};

export async function generateAutomationScript(
  input: AutomationScriptWorkflowInput,
): Promise<AutomationScriptWorkflowResult> {
  const variableRuntime = createVariableRuntimeBundle({
    metadata: input.variableMetadata,
    values: input.variableValues,
    runId: input.taskId,
  });
  let storageStatePath: string | undefined;
  if (input.authentication) {
    await input.onStage?.("PREPARING_AUTHENTICATION");
    await input.onLog?.(
      `正在使用账号对象“${input.authentication.variableName}”准备独立认证环境。`,
    );
    storageStatePath = await prepareAuthenticationState({
      workDir: path.join(input.workDir, "authentication"),
      baseUrl: input.baseUrl,
      authentication: input.authentication,
      variableModuleSource: variableRuntime.source,
      environment: {
        ...process.env,
        BASE_URL: input.baseUrl,
        ...variableRuntime.environment,
        PLAYWRIGHT_HTML_OPEN: "never",
      },
      abortSignal: input.abortSignal,
    });
    await input.onLog?.("登录方法执行成功，已创建本次任务的临时认证状态。");
  }
  const session = new PlaywrightCliSession({
    taskId: input.taskId,
    workDir: path.join(input.workDir, "probe"),
    baseUrl: input.baseUrl,
    secretValues: Object.values(input.variableValues),
    storageStatePath,
    abortSignal: input.abortSignal,
  });

  await session.initialize();
  await input.onStage?.("PROBING_PAGE");
  await input.onLog?.("已创建独立的无头 Chromium 页面探测会话。");

  try {
    const generated = await runAutomationScriptAgent({
      model: input.model,
      instructions: generateAutomationScriptSystemPrompt,
      prompt: buildAutomationScriptPrompt({
        baseUrl: input.baseUrl,
        automationInstructions: input.automationInstructions,
        authentication: input.authentication
          ? {
              variableName: input.authentication.variableName,
            }
          : null,
        variables: input.variableMetadata,
        codeEvidence: input.codeEvidence,
        testCase: input.testCase,
      }),
      session,
      variables: input.variableValues,
      abortSignal: input.abortSignal,
      onLog: input.onLog,
      onScriptSubmitted: () => input.onStage?.("GENERATING_SCRIPT"),
    });

    const script = validateAutomationScriptStatic({
      script: generated.script,
      variables: input.variableMetadata,
      authentication: input.authentication,
      requiresCleanup: requiresIsolatedTestData(input.testCase),
    });
    await input.onLog?.("脚本已通过静态安全检查。");

    await input.onStage?.("VALIDATING_SCRIPT");
    await validateAutomationScriptCompilation({
      script,
      baseUrl: input.baseUrl,
      workDir: path.join(input.workDir, "validation"),
      abortSignal: input.abortSignal,
      loginMethodSource: input.authentication?.loginMethodSource,
      variableModuleSource: variableRuntime.source,
    });
    await input.onLog?.(
      "脚本已通过 Playwright 编译与单测试发现检查，未执行业务操作。",
    );

    return { script, usage: generated.usage };
  } finally {
    await session.close();
  }
}
