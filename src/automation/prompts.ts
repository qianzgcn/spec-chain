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
  authentication: {
    profileName: string;
    usernameVariableName: string;
    passwordVariableName: string;
  } | null;
  variables: readonly AutomationVariableMetadata[];
  testCase: {
    code: string;
    name: string;
    preconditions: string | null;
    steps: string;
  };
}) {
  const authentication = input.authentication
    ? `本次任务已使用登录身份“${input.authentication.profileName}”完成页面登录，探测会话打开后已经处于登录状态。
最终脚本必须在第一行导入 @playwright/test 后，紧接着添加：
import { login } from "./specchain/login";

并在业务操作前调用一次：
await login(page, {
  username: process.env.${input.authentication.usernameVariableName}!,
  password: process.env.${input.authentication.passwordVariableName}!,
});

不得探测、复制或重新实现登录页面操作。`
    : `本用例配置为“不预登录”，不得导入或调用项目登录方法。
只有测试用例本身明确验证登录、退出或认证失败时，才探测并实现相应认证步骤；如果当前用例并非认证场景但页面要求登录，请调用 reportFailure，并建议为用例选择登录身份。`;

  return `请为下列单条测试用例探测真实页面并生成可直接运行的 Playwright Test TypeScript 脚本。

Base URL：
${input.baseUrl}

登录复用：
${authentication}

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
