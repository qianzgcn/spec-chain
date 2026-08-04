import type { ModelProvider, ModelUsage } from "@/ai/model-provider";
import {
  analyzeRelevantCode,
  type CodeReferenceRecord,
  type CodeEvidence,
  type RepositorySnapshotRecord,
} from "@/ai/relevant-code";
import type {
  RepositoryAccess,
  RepositoryCodeSource,
} from "@/ai/repository-code-source";
import { AiWorkflowError, type WorkflowLogEvent } from "@/ai/workflow";
import { AiExecutionStage } from "@/generated/prisma/enums";
import {
  buildAutomationCodeSelectionPrompt,
  automationCodeSelectionSystemPrompt,
} from "@/automation/prompts";

const MAX_CODE_CONTEXT_FILES = 8;
const MAX_CODE_CONTEXT_CHARACTERS = 120_000;
const MAX_CODE_FILE_CHARACTERS = 32_000;
const NON_IMPLEMENTATION_PATH_SEGMENTS = new Set([
  "__tests__",
  "docs",
  "test",
  "tests",
]);

export type AutomationCodeTestCase = {
  code: string;
  name: string;
  preconditions: string | null;
  steps: string;
};

export type AutomationCodeReadinessResult = {
  repositories: RepositorySnapshotRecord[];
  codeReferences: CodeReferenceRecord[];
  codeEvidence: CodeEvidence[];
  usage: ModelUsage;
};

function formatTestCaseForCodeSearch(testCase: AutomationCodeTestCase) {
  return `测试用例编号：${testCase.code}
测试用例名称：${testCase.name}

前置条件：
${testCase.preconditions?.trim() || "无"}

测试步骤：
${testCase.steps}`;
}

function limitCodeEvidence(codeEvidence: readonly CodeEvidence[]) {
  const limited: CodeEvidence[] = [];
  let remainingCharacters = MAX_CODE_CONTEXT_CHARACTERS;

  for (const file of codeEvidence.slice(0, MAX_CODE_CONTEXT_FILES)) {
    if (remainingCharacters <= 0) break;

    const contentLimit = Math.min(
      MAX_CODE_FILE_CHARACTERS,
      remainingCharacters,
    );
    const content = file.content.slice(0, contentLimit);
    limited.push({
      ...file,
      content:
        content.length === file.content.length
          ? content
          : `${content}\n\n【代码上下文已截断】`,
    });
    remainingCharacters -= content.length;
  }

  return limited;
}

function isImplementationEvidence(file: CodeEvidence) {
  const normalizedPath = file.path.replaceAll("\\", "/").toLowerCase();
  const segments = normalizedPath.split("/");
  const fileName = segments.at(-1) ?? "";
  return (
    !segments.some((segment) =>
      NON_IMPLEMENTATION_PATH_SEGMENTS.has(segment),
    ) &&
    !/\.(?:test|spec|stories)\.[^.]+$/.test(fileName) &&
    !fileName.endsWith(".d.ts") &&
    !fileName.startsWith("readme")
  );
}

export function addModelUsage(target: ModelUsage, addition: ModelUsage) {
  target.inputTokens += addition.inputTokens;
  target.outputTokens += addition.outputTokens;
  target.totalTokens += addition.totalTokens;
}

export async function checkAutomationCodeReadiness(input: {
  testCase: AutomationCodeTestCase;
  repositories: RepositoryAccess[];
  modelProvider: ModelProvider;
  repositoryCodeSource: RepositoryCodeSource;
  abortSignal?: AbortSignal;
  onStage?: (stage: AiExecutionStage) => Promise<void>;
  onLog?: (event: WorkflowLogEvent) => Promise<void>;
}): Promise<AutomationCodeReadinessResult> {
  let result: Awaited<ReturnType<typeof analyzeRelevantCode>>;
  try {
    result = await analyzeRelevantCode({
      requirementText: formatTestCaseForCodeSearch(input.testCase),
      businessContext: null,
      repositories: input.repositories,
      modelProvider: input.modelProvider,
      repositoryCodeSource: input.repositoryCodeSource,
      systemPrompt: automationCodeSelectionSystemPrompt,
      buildSelectionPrompt: (selection) =>
        buildAutomationCodeSelectionPrompt({
          requirementText: selection.requirementText,
          repository: selection.repository,
          branch: selection.branch,
          commitSha: selection.commitSha,
          candidatePaths: selection.candidatePaths,
        }),
      abortSignal: input.abortSignal,
      onStage: input.onStage,
      onLog: input.onLog,
    });
  } catch (error) {
    if (
      error instanceof AiWorkflowError &&
      error.message === "没有在项目仓库中找到与需求相关的代码"
    ) {
      throw new AiWorkflowError(
        "未找到与当前测试用例相关的可读代码，无法确认功能已实现，未启动页面探测。",
      );
    }
    if (
      error instanceof AiWorkflowError &&
      error.message === "相关代码文件无法读取，不能可靠生成内容"
    ) {
      throw new AiWorkflowError(
        "定位到的相关代码无法读取，无法确认功能已实现，未启动页面探测。",
      );
    }
    throw error;
  }

  const implementationEvidence = result.codeEvidence.filter(
    isImplementationEvidence,
  );
  if (implementationEvidence.length === 0) {
    throw new AiWorkflowError(
      "未找到与当前测试用例相关的可读代码，无法确认功能已实现，未启动页面探测。",
    );
  }

  return {
    repositories: result.repositories,
    codeReferences: result.codeReferences,
    codeEvidence: limitCodeEvidence(implementationEvidence),
    usage: result.usage,
  };
}
