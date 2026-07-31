import { hasToolCall, stepCountIs, ToolLoopAgent } from "ai";
import type { LanguageModel } from "ai";

import {
  normalizeModelUsage,
  toModelProviderError,
  type ModelUsage,
} from "@/ai/model-provider";
import {
  createAutomationAgentTools,
  type AutomationAgentTerminalResult,
} from "@/automation/agent-tools";
import { PlaywrightCliSession } from "@/automation/playwright-cli-session";

const MAX_AGENT_STEPS = 30;
const MAX_OUTPUT_TOKENS = 32_768;

export class AutomationAgentError extends Error {
  constructor(
    public readonly code:
      "TOOL_CALLING_UNSUPPORTED" | "STEP_LIMIT" | "GENERATION_REJECTED",
    message: string,
  ) {
    super(message);
    this.name = "AutomationAgentError";
  }
}

export async function runAutomationScriptAgent(input: {
  model: LanguageModel;
  instructions: string;
  prompt: string;
  session: PlaywrightCliSession;
  variables: Readonly<Record<string, string>>;
  abortSignal: AbortSignal;
  onLog?: (message: string) => void | Promise<void>;
  onScriptSubmitted?: () => void | Promise<void>;
}): Promise<{ script: string; usage: ModelUsage }> {
  const toolSet = createAutomationAgentTools(input);

  const agent = new ToolLoopAgent({
    model: input.model,
    instructions: input.instructions,
    tools: toolSet.tools,
    toolsContext: toolSet.toolsContext,
    toolChoice: "auto",
    temperature: 0,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: 2,
    stopWhen: [
      hasToolCall("submitScript"),
      hasToolCall("reportFailure"),
      stepCountIs(MAX_AGENT_STEPS),
    ],
  });

  let result;
  try {
    result = await agent.generate({
      prompt: input.prompt,
      abortSignal: input.abortSignal,
    });
  } catch (error) {
    throw toModelProviderError(error);
  }

  const submitted =
    toolSet.getTerminalResult() as AutomationAgentTerminalResult | null;
  if (submitted?.kind === "FAILURE") {
    throw new AutomationAgentError(
      "GENERATION_REJECTED",
      `${submitted.reason}；修改建议：${submitted.suggestion}`,
    );
  }
  if (submitted?.kind === "SCRIPT") {
    return {
      script: submitted.script,
      usage: normalizeModelUsage(result.totalUsage),
    };
  }

  if (result.steps.length >= MAX_AGENT_STEPS) {
    throw new AutomationAgentError(
      "STEP_LIMIT",
      "页面探测达到 30 个工具步骤，仍无法可靠生成脚本",
    );
  }
  throw new AutomationAgentError(
    "TOOL_CALLING_UNSUPPORTED",
    "模型未使用自动化脚本生成所需的工具调用，请为该能力选择支持 OpenAI 兼容工具调用的模型",
  );
}
