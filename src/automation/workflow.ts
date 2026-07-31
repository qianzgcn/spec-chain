import path from "node:path";

import type { LanguageModel } from "ai";

import { runAutomationScriptAgent } from "@/automation/agent";
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
import type { ModelUsage } from "@/ai/model-provider";

export type AutomationGenerationStage =
  "PROBING_PAGE" | "GENERATING_SCRIPT" | "VALIDATING_SCRIPT";

export type AutomationScriptWorkflowInput = {
  taskId: string;
  workDir: string;
  model: LanguageModel;
  baseUrl: string;
  automationInstructions: string | null;
  variables: Array<
    AutomationVariableMetadata & {
      value: string;
    }
  >;
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
  const variableMetadata = input.variables.map(
    ({ name, kind, description }) => ({ name, kind, description }),
  );
  const variableValues = Object.fromEntries(
    input.variables.map((variable) => [variable.name, variable.value]),
  );
  const session = new PlaywrightCliSession({
    taskId: input.taskId,
    workDir: path.join(input.workDir, "probe"),
    baseUrl: input.baseUrl,
    secretValues: input.variables.map((variable) => variable.value),
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
        variables: variableMetadata,
        testCase: input.testCase,
      }),
      session,
      variables: variableValues,
      abortSignal: input.abortSignal,
      onLog: input.onLog,
      onScriptSubmitted: () => input.onStage?.("GENERATING_SCRIPT"),
    });

    const script = validateAutomationScriptStatic({
      script: generated.script,
      allowedVariableNames: variableMetadata.map((variable) => variable.name),
      requiresCleanup: requiresIsolatedTestData(input.testCase),
    });
    await input.onLog?.("脚本已通过静态安全检查。");

    await input.onStage?.("VALIDATING_SCRIPT");
    await validateAutomationScriptCompilation({
      script,
      baseUrl: input.baseUrl,
      workDir: path.join(input.workDir, "validation"),
      abortSignal: input.abortSignal,
    });
    await input.onLog?.(
      "脚本已通过 Playwright 编译与单测试发现检查，未执行业务操作。",
    );

    return { script, usage: generated.usage };
  } finally {
    await session.close();
  }
}
