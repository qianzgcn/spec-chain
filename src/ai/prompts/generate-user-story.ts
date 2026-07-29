import { readFileSync } from "node:fs";

import { renderPromptTemplate } from "@/ai/prompts/template";

function readPromptFile(url: URL) {
  const content = readFileSync(url, "utf8").trim();
  if (!content) {
    throw new Error(`提示词文件不能为空：${url.pathname}`);
  }
  return content;
}

export const generateUserStorySystemPrompt = readPromptFile(
  new URL("./generate-user-story/skill.md", import.meta.url),
);

const selectCodePromptTemplate = readPromptFile(
  new URL("./generate-user-story/select-code.md", import.meta.url),
);

const generateDraftPromptTemplate = readPromptFile(
  new URL("./generate-user-story/generate-draft.md", import.meta.url),
);

export type CodeSelectionPromptInput = {
  requirementText: string;
  featureContext: string | null;
  repository: string;
  branch: string;
  commitSha: string;
  candidatePaths: readonly string[];
};

export type UserStoryCodeEvidence = {
  repository: string;
  path: string;
  commitSha: string;
  selectionReason: string;
  content: string;
};

function formatFeatureContext(featureContext: string | null) {
  return featureContext?.trim() || "无";
}

function formatCandidatePaths(paths: readonly string[]) {
  return paths.map((path) => `- ${JSON.stringify(path)}`).join("\n");
}

function formatCodeEvidence(files: readonly UserStoryCodeEvidence[]) {
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

export function buildCodeSelectionPrompt(input: CodeSelectionPromptInput) {
  return renderPromptTemplate(selectCodePromptTemplate, {
    REQUIREMENT_TEXT: input.requirementText,
    FEATURE_CONTEXT: formatFeatureContext(input.featureContext),
    REPOSITORY: input.repository,
    BRANCH: input.branch,
    COMMIT_SHA: input.commitSha,
    CANDIDATE_PATHS: formatCandidatePaths(input.candidatePaths),
  });
}

export function buildUserStoryDraftPrompt(input: {
  requirementText: string;
  featureContext: string | null;
  codeEvidence: readonly UserStoryCodeEvidence[];
}) {
  return renderPromptTemplate(generateDraftPromptTemplate, {
    REQUIREMENT_TEXT: input.requirementText,
    FEATURE_CONTEXT: formatFeatureContext(input.featureContext),
    CODE_EVIDENCE: formatCodeEvidence(input.codeEvidence),
  });
}
