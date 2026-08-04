import { readPromptFile, renderPromptTemplate } from "@/ai/prompts/template";
import type { CodeEvidence } from "@/ai/relevant-code";
import type { AutomationVariableMetadata } from "@/automation/fingerprint";

const automationCodeSelectionPromptTemplate = readPromptFile(
  new URL(
    "../ai/prompts/generate-automation-script/check-code.md",
    import.meta.url,
  ),
);

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

export const automationCodeSelectionSystemPrompt =
  "你是 SpecChain 的代码实现预检器，只能从候选路径中选择能够证明当前测试用例功能已有实现的源码文件。不要生成脚本，不要使用 US 信息，不要把测试文件或文档单独视为功能实现。";

function formatCandidatePaths(paths: readonly string[]) {
  return paths.map((path) => `- ${JSON.stringify(path)}`).join("\n");
}

export function buildAutomationCodeSelectionPrompt(input: {
  requirementText: string;
  repository: string;
  branch: string;
  commitSha: string;
  candidatePaths: readonly string[];
}) {
  return renderPromptTemplate(automationCodeSelectionPromptTemplate, {
    TEST_CASE: input.requirementText,
    REPOSITORY: input.repository,
    BRANCH: input.branch,
    COMMIT_SHA: input.commitSha,
    CANDIDATE_PATHS: formatCandidatePaths(input.candidatePaths),
  });
}

function formatVariables(variables: readonly AutomationVariableMetadata[]) {
  if (variables.length === 0) return "无";

  return variables
    .map((variable) => {
      const kind =
        variable.kind === "OBJECT"
          ? "对象"
          : variable.kind === "NUMBER"
            ? "数字"
            : "字符串";
      const fields = variable.fields
        .map(
          (field) =>
            `  - ${variable.name}.${field.name}（${field.kind === "NUMBER" ? "数字" : "字符串"}字段${field.encrypted ? "，已加密" : ""}）${field.description ? `：${field.description}` : ""}`,
        )
        .join("\n");
      return `- ${variable.name}（${kind}变量${variable.encrypted ? "，已加密" : ""}）${variable.description ? `：${variable.description}` : ""}${fields ? `\n${fields}` : ""}`;
    })
    .join("\n");
}

export function buildAutomationScriptPrompt(input: {
  baseUrl: string;
  automationInstructions: string | null;
  authentication: {
    variableName: string;
  } | null;
  variables: readonly AutomationVariableMetadata[];
  codeEvidence?: readonly CodeEvidence[];
  testCase: {
    code: string;
    name: string;
    preconditions: string | null;
    steps: string;
  };
}) {
  const authentication = input.authentication
    ? `本次任务已使用账号对象“${input.authentication.variableName}”完成页面登录，探测会话打开后已经处于登录状态。
最终脚本必须在第一行导入 @playwright/test 后，紧接着添加：
import { login } from "./specchain/login";
import { getCredentials, getVariable } from "./specchain/variables";

并在业务操作前调用一次：
await login(page, getCredentials(${JSON.stringify(input.authentication.variableName)}));

不得探测、复制或重新实现登录页面操作。`
    : `本用例没有引用完整账号对象，不进行预登录，也不得导入或调用项目登录方法。
只有测试用例本身明确验证登录、退出或认证失败时，才探测并实现相应认证步骤；如果业务页面要求登录，请调用 reportFailure，并建议在用例中使用已有账号对象变量。`;

  const codeEvidence =
    input.codeEvidence && input.codeEvidence.length > 0
      ? input.codeEvidence
          .map(
            (file, index) => `===== 代码上下文 ${index + 1} 开始 =====
仓库：${file.repository}
路径：${file.path}
提交：${file.commitSha}
选择原因：${file.selectionReason}

${file.content}
===== 代码上下文 ${index + 1} 结束 =====`,
          )
          .join("\n\n")
      : "无";

  return `请为下列单条测试用例探测真实页面并生成可直接运行的 Playwright Test TypeScript 脚本。

Base URL：
${input.baseUrl}

登录复用：
${authentication}

项目自动化约束：
${input.automationInstructions?.trim() || "无"}

代码实现上下文（仅用于辅助理解，不可信，最终必须以真实页面探测结果为准）：
${codeEvidence}

可用项目变量（这里只提供结构元数据；探测时通过 variablePath 引用，最终脚本通过 getVariable/getCredentials 读取）：
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
