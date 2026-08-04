import { readPromptFile, renderPromptTemplate } from "@/ai/prompts/template";
import type { CodeEvidence } from "@/ai/relevant-code";
import type { ProjectVariableMetadata } from "@/lib/project-variables/references";

export const generateTestCasesSystemPrompt = readPromptFile(
  new URL("./generate-test-cases/skill.md", import.meta.url),
);

const selectCodePromptTemplate = readPromptFile(
  new URL("./generate-test-cases/select-code.md", import.meta.url),
);

const generateDraftsPromptTemplate = readPromptFile(
  new URL("./generate-test-cases/generate-drafts.md", import.meta.url),
);

function formatCandidatePaths(paths: readonly string[]) {
  return paths.map((path) => `- ${JSON.stringify(path)}`).join("\n");
}

function formatCodeEvidence(files: readonly CodeEvidence[]) {
  return files
    .map(
      (file, index) => `===== 代码证据 ${index + 1} 开始 =====
仓库：${file.repository}
路径：${file.path}
提交：${file.commitSha}
选择原因：${file.selectionReason}

${file.content}
===== 代码证据 ${index + 1} 结束 =====`,
    )
    .join("\n\n");
}

function formatAvailableGroups(
  groups: readonly { id: string; name: string }[],
) {
  if (groups.length === 0) {
    return "当前项目没有可用分组，所有用例的 groupId 必须返回 null。";
  }

  return groups
    .map(
      (group) =>
        `- groupId=${JSON.stringify(group.id)}，名称=${JSON.stringify(group.name)}`,
    )
    .join("\n");
}

function formatAvailableVariables(
  variables: readonly ProjectVariableMetadata[],
) {
  if (variables.length === 0) return "当前项目没有可用变量，不得生成变量引用。";

  return variables
    .map((variable) => {
      const description = variable.description
        ? `，描述=${JSON.stringify(variable.description)}`
        : "";
      if (variable.kind !== "OBJECT") {
        const kind = variable.kind === "NUMBER" ? "数字" : "字符串";
        return `- ${variable.name}：${kind}变量${variable.encrypted ? "（已加密）" : ""}${description}`;
      }
      const fields = variable.fields
        .map(
          (field) =>
            `  - ${variable.name}.${field.name}：${field.kind === "NUMBER" ? "数字" : "字符串"}字段${field.encrypted ? "（已加密）" : ""}${field.description ? `，描述=${JSON.stringify(field.description)}` : ""}`,
        )
        .join("\n");
      return `- ${variable.name}：对象${description}\n${fields}`;
    })
    .join("\n");
}

export function buildTestCaseCodeSelectionPrompt(input: {
  requirementText: string;
  repository: string;
  branch: string;
  commitSha: string;
  candidatePaths: readonly string[];
}) {
  return renderPromptTemplate(selectCodePromptTemplate, {
    REQUIREMENT_TEXT: input.requirementText,
    REPOSITORY: input.repository,
    BRANCH: input.branch,
    COMMIT_SHA: input.commitSha,
    CANDIDATE_PATHS: formatCandidatePaths(input.candidatePaths),
  });
}

export function buildTestCaseDraftsPrompt(input: {
  requirementText: string;
  codeEvidence: readonly CodeEvidence[];
  groups: readonly { id: string; name: string }[];
  variables: readonly ProjectVariableMetadata[];
}) {
  return renderPromptTemplate(generateDraftsPromptTemplate, {
    REQUIREMENT_TEXT: input.requirementText,
    CODE_EVIDENCE: formatCodeEvidence(input.codeEvidence),
    AVAILABLE_GROUPS: formatAvailableGroups(input.groups),
    AVAILABLE_VARIABLES: formatAvailableVariables(input.variables),
  });
}
