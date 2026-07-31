import { readPromptFile } from "@/ai/prompts/template";
import type { AutomationVariableMetadata } from "@/automation/fingerprint";

const skillPrompt = readPromptFile(
  new URL("../ai/prompts/generate-automation-script/skill.md", import.meta.url),
);
const probePagePrompt = readPromptFile(
  new URL(
    "../ai/prompts/generate-automation-script/probe-page.md",
    import.meta.url,
  ),
);
const generateScriptPrompt = readPromptFile(
  new URL(
    "../ai/prompts/generate-automation-script/generate-script.md",
    import.meta.url,
  ),
);
const testDataSafetyPrompt = readPromptFile(
  new URL(
    "../ai/prompts/generate-automation-script/test-data-safety.md",
    import.meta.url,
  ),
);

export const generateAutomationScriptSystemPrompt = [
  skillPrompt,
  probePagePrompt,
  generateScriptPrompt,
  testDataSafetyPrompt,
].join("\n\n---\n\n");

function formatVariables(variables: readonly AutomationVariableMetadata[]) {
  if (variables.length === 0) return "无";

  return variables
    .map(
      (variable) =>
        `- ${variable.name}（${variable.kind === "SECRET" ? "敏感" : "普通"}）${variable.description ? `：${variable.description}` : ""}`,
    )
    .join("\n");
}

export function buildAutomationScriptPrompt(input: {
  baseUrl: string;
  automationInstructions: string | null;
  variables: readonly AutomationVariableMetadata[];
  testCase: {
    code: string;
    name: string;
    preconditions: string | null;
    steps: string;
  };
}) {
  return `请为下列单条测试用例探测真实页面并生成可直接运行的 Playwright Test TypeScript 脚本。

Base URL：
${input.baseUrl}

项目自动化约束：
${input.automationInstructions?.trim() || "无"}

可用项目变量（这里只提供元数据；需要使用时通过变量名调用填写工具，最终脚本使用 process.env）：
${formatVariables(input.variables)}

测试用例：
编号：${input.testCase.code}
名称：${input.testCase.name}

前置条件：
${input.testCase.preconditions?.trim() || "无"}

测试步骤：
${input.testCase.steps}

先检查用例可执行性和数据安全，再按工具结果探测页面。只有真实探测得到足够证据后，才调用 submitScript；信息不足或无法安全执行时调用 reportFailure。`;
}
