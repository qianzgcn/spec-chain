import { readPromptFile, renderPromptTemplate } from "@/ai/prompts/template";
import type { CodeEvidence } from "@/ai/relevant-code";
import type { ProjectVariableMetadata } from "@/lib/project-variables/references";

export const checkConsistencySystemPrompt = readPromptFile(
  new URL("./check-consistency/skill.md", import.meta.url),
);

const selectCodeTemplate = readPromptFile(
  new URL("./check-consistency/select-code.md", import.meta.url),
);

const compareTemplate = readPromptFile(
  new URL("./check-consistency/compare.md", import.meta.url),
);

function formatPaths(paths: readonly string[]) {
  return paths.map((path) => `- ${JSON.stringify(path)}`).join("\n");
}

function formatCodeEvidence(files: readonly CodeEvidence[]) {
  return files
    .map(
      (file, index) => `===== 代码证据 ${index + 1} =====
仓库：${file.repository}
路径：${file.path}
提交：${file.commitSha}
选择原因：${file.selectionReason}

${file.content}`,
    )
    .join("\n\n");
}

function formatGroups(groups: readonly { id: string; name: string }[]) {
  return groups.length
    ? groups
        .map(
          (group) =>
            `- id=${JSON.stringify(group.id)}，名称=${JSON.stringify(group.name)}`,
        )
        .join("\n")
    : "无可用分组。";
}

function formatVariables(variables: readonly ProjectVariableMetadata[]) {
  if (variables.length === 0) return "无可用变量。";

  return variables
    .map((variable) => {
      if (variable.kind !== "OBJECT") {
        return `- ${variable.name}：${variable.kind === "NUMBER" ? "数字" : "字符串"}`;
      }
      return `- ${variable.name}：对象（${variable.fields
        .map((field) => `${field.name}:${field.kind}`)
        .join("，")}）`;
    })
    .join("\n");
}

export function buildConsistencyCodeSelectionPrompt(input: {
  specification: string;
  repository: string;
  branch: string;
  commitSha: string;
  candidatePaths: readonly string[];
}) {
  return renderPromptTemplate(selectCodeTemplate, {
    SPECIFICATION: input.specification,
    REPOSITORY: input.repository,
    BRANCH: input.branch,
    COMMIT_SHA: input.commitSha,
    CANDIDATE_PATHS: formatPaths(input.candidatePaths),
  });
}

export function buildConsistencyComparisonPrompt(input: {
  specification: string;
  codeEvidence: readonly CodeEvidence[];
  groups: readonly { id: string; name: string }[];
  variables: readonly ProjectVariableMetadata[];
}) {
  return renderPromptTemplate(compareTemplate, {
    SPECIFICATION: input.specification,
    CODE_EVIDENCE: formatCodeEvidence(input.codeEvidence),
    GROUPS: formatGroups(input.groups),
    VARIABLES: formatVariables(input.variables),
  });
}
