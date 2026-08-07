import { readPromptFile, renderPromptTemplate } from "@/ai/prompts/template";
import type { CodeEvidence } from "@/ai/relevant-code";

export const reviewRequirementImplementationSystemPrompt = readPromptFile(
  new URL("./review-requirement-implementation/skill.md", import.meta.url),
);

const selectCodeTemplate = readPromptFile(
  new URL(
    "./review-requirement-implementation/select-code.md",
    import.meta.url,
  ),
);

const reviewTemplate = readPromptFile(
  new URL("./review-requirement-implementation/review.md", import.meta.url),
);

function formatPaths(paths: readonly string[]) {
  return paths.map((path) => `- ${JSON.stringify(path)}`).join("\n");
}

function formatCodeEvidence(files: readonly CodeEvidence[]) {
  return files
    .map(
      (file, index) => `===== 代码文件 ${index + 1} =====
仓库：${file.repository}
路径：${file.path}
提交：${file.commitSha}
定位原因：${file.selectionReason}

${file.content}`,
    )
    .join("\n\n");
}

export function buildImplementationReviewCodeSelectionPrompt(input: {
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

export function buildImplementationReviewPrompt(input: {
  specification: string;
  codeEvidence: readonly CodeEvidence[];
}) {
  return renderPromptTemplate(reviewTemplate, {
    SPECIFICATION: input.specification,
    CODE_EVIDENCE: formatCodeEvidence(input.codeEvidence),
  });
}
