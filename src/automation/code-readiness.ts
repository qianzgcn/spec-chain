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
  buildAutomationCodeVerificationPrompt,
  automationCodeSelectionSystemPrompt,
  automationCodeVerificationSystemPrompt,
} from "@/automation/prompts";
import { z } from "zod";

const MAX_CODE_CONTEXT_FILES = 8;
const MAX_CODE_CONTEXT_CHARACTERS = 120_000;
const MAX_CODE_FILE_CHARACTERS = 32_000;
const NON_IMPLEMENTATION_PATH_SEGMENTS = new Set([
  "__tests__",
  "docs",
  "test",
  "tests",
]);

const codeImplementationVerificationSchema = z.object({
  implemented: z.boolean(),
  reason: z.string().min(1),
});

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
    !fileName.startsWith("readme") &&
    file.content.trim().length > 0
  );
}

export function addModelUsage(target: ModelUsage, addition: ModelUsage) {
  target.inputTokens += addition.inputTokens;
  target.outputTokens += addition.outputTokens;
  target.totalTokens += addition.totalTokens;
}

function formatVerificationFailureReason(reason: string) {
  const normalized = reason
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.slice(0, 240) || "未找到能够证明目标行为已实现的代码证据";
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

  const codeEvidence = limitCodeEvidence(implementationEvidence);
  await input.onLog?.({
    level: "INFO",
    stage: AiExecutionStage.SELECTING_CODE,
    message: `正在核实 ${codeEvidence.length} 个候选源码文件是否直接实现测试用例目标。`,
  });
  const verification = await input.modelProvider.generateStructured({
    schema: codeImplementationVerificationSchema,
    system: automationCodeVerificationSystemPrompt,
    prompt: buildAutomationCodeVerificationPrompt({
      requirementText: formatTestCaseForCodeSearch(input.testCase),
      codeEvidence,
    }),
    abortSignal: input.abortSignal,
  });
  addModelUsage(result.usage, verification.usage);
  if (!verification.output.implemented) {
    const reason = formatVerificationFailureReason(verification.output.reason);
    await input.onLog?.({
      level: "WARN",
      stage: AiExecutionStage.SELECTING_CODE,
      message: `代码预检未通过：${reason}，未启动页面探测。`,
    });
    throw new AiWorkflowError(`代码预检未通过：${reason}，未启动页面探测。`);
  }

  return {
    repositories: result.repositories,
    codeReferences: result.codeReferences,
    codeEvidence,
    usage: result.usage,
  };
}
