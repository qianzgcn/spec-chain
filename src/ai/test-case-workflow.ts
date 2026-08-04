import { z } from "zod";

import type { ModelProvider, ModelUsage } from "@/ai/model-provider";
import {
  buildTestCaseCodeSelectionPrompt,
  buildTestCaseDraftsPrompt,
} from "@/ai/prompts/generate-test-cases";
import {
  addUsage,
  analyzeRelevantCode,
  type CodeReferenceRecord,
  type RepositorySnapshotRecord,
} from "@/ai/relevant-code";
import type {
  RepositoryAccess,
  RepositoryCodeSource,
} from "@/ai/repository-code-source";
import type { AiSkill, SkillResolver } from "@/ai/skills";
import {
  AiWorkflowError,
  type AiWorkflow,
  type WorkflowLogEvent,
} from "@/ai/workflow";
import {
  AiCapability,
  AiExecutionStage,
  TestPriority,
} from "@/generated/prisma/enums";
import {
  validateTestCaseVariableReferences,
  VariableReferenceError,
  type ProjectVariableMetadata,
} from "@/lib/project-variables/references";

export const generatedTestCaseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  priority: z.enum(TestPriority),
  preconditions: z.string().trim().max(100_000),
  steps: z.string().trim().min(1).max(100_000),
  groupId: z.string().trim().min(1).nullable(),
});

export function createGeneratedTestCasesDecisionSchema(
  groupIds: readonly string[],
  variables: readonly ProjectVariableMetadata[],
) {
  const validGroupIds = new Set(groupIds);

  return z
    .object({
      sufficient: z.boolean(),
      failureReason: z.string(),
      testCases: z.array(generatedTestCaseSchema).max(20),
    })
    .superRefine((value, context) => {
      if (value.sufficient && value.testCases.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["testCases"],
          message: "信息充分时至少需要一条测试用例",
        });
      }
      if (!value.sufficient && value.testCases.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["testCases"],
          message: "信息不足时不能返回测试用例",
        });
      }
      if (!value.sufficient && !value.failureReason.trim()) {
        context.addIssue({
          code: "custom",
          path: ["failureReason"],
          message: "信息不足时必须说明具体原因",
        });
      }

      const names = new Set<string>();
      for (const [index, testCase] of value.testCases.entries()) {
        const normalizedName = testCase.name
          .toLocaleLowerCase("zh-CN")
          .replaceAll(/\s+/g, "");
        if (names.has(normalizedName)) {
          context.addIssue({
            code: "custom",
            path: ["testCases", index, "name"],
            message: "生成结果中存在重复用例",
          });
        }
        names.add(normalizedName);

        if (testCase.groupId && !validGroupIds.has(testCase.groupId)) {
          context.addIssue({
            code: "custom",
            path: ["testCases", index, "groupId"],
            message: "用例分组不在当前项目的可选范围内",
          });
        }
        try {
          validateTestCaseVariableReferences({
            preconditions: testCase.preconditions || null,
            steps: testCase.steps,
            variables,
          });
        } catch (error) {
          if (!(error instanceof VariableReferenceError)) throw error;
          context.addIssue({
            code: "custom",
            path: ["testCases", index, "steps"],
            message: error.message,
          });
        }
      }
    });
}

export type GeneratedTestCase = z.infer<typeof generatedTestCaseSchema>;

export type GenerateTestCasesWorkflowInput = {
  requirementText: string;
  repositories: RepositoryAccess[];
  groups: Array<{ id: string; name: string }>;
  variables: ProjectVariableMetadata[];
  abortSignal?: AbortSignal;
  onStage?: (stage: AiExecutionStage) => Promise<void>;
  onLog?: (event: WorkflowLogEvent) => Promise<void>;
  onRepositoriesLoaded?: (
    repositories: RepositorySnapshotRecord[],
  ) => Promise<void>;
  onCodeSelected?: (references: CodeReferenceRecord[]) => Promise<void>;
};

export type GenerateTestCasesWorkflowResult = {
  drafts: GeneratedTestCase[];
  skill: AiSkill;
  repositories: RepositorySnapshotRecord[];
  codeReferences: CodeReferenceRecord[];
  usage: ModelUsage;
};

type WorkflowDependencies = {
  modelProvider: ModelProvider;
  repositoryCodeSource: RepositoryCodeSource;
  skillResolver: SkillResolver;
};

export function createGenerateTestCasesWorkflow({
  modelProvider,
  repositoryCodeSource,
  skillResolver,
}: WorkflowDependencies): AiWorkflow<
  GenerateTestCasesWorkflowInput,
  GenerateTestCasesWorkflowResult
> {
  return {
    async run({
      requirementText,
      repositories,
      groups,
      variables,
      abortSignal,
      onStage,
      onLog,
      onRepositoriesLoaded,
      onCodeSelected,
    }) {
      const skill = skillResolver.resolve(AiCapability.GENERATE_TEST_CASES);
      const relevantCode = await analyzeRelevantCode({
        requirementText,
        businessContext: null,
        repositories,
        modelProvider,
        repositoryCodeSource,
        systemPrompt: skill.instructions,
        buildSelectionPrompt: (selectionInput) =>
          buildTestCaseCodeSelectionPrompt({
            requirementText: selectionInput.requirementText,
            repository: selectionInput.repository,
            branch: selectionInput.branch,
            commitSha: selectionInput.commitSha,
            candidatePaths: selectionInput.candidatePaths,
          }),
        abortSignal,
        onStage,
        onLog,
        onRepositoriesLoaded,
        onCodeSelected,
      });

      await onStage?.(AiExecutionStage.GENERATING_DRAFT);
      const generation = await modelProvider.generateStructured({
        schema: createGeneratedTestCasesDecisionSchema(
          groups.map((group) => group.id),
          variables,
        ),
        system: skill.instructions,
        prompt: buildTestCaseDraftsPrompt({
          requirementText,
          codeEvidence: relevantCode.codeEvidence,
          groups,
          variables,
        }),
        abortSignal,
        onRetry: ({ nextAttempt, maxAttempts, reason }) =>
          onLog?.({
            level: "WARN",
            stage: AiExecutionStage.GENERATING_DRAFT,
            message: `模型返回的测试用例草稿无法校验（${reason}），正在进行第 ${nextAttempt}/${maxAttempts} 次生成。`,
          }),
      });
      addUsage(relevantCode.usage, generation.usage);

      if (!generation.output.sufficient) {
        await onLog?.({
          level: "WARN",
          stage: AiExecutionStage.GENERATING_DRAFT,
          message: "模型判断当前需求或代码信息不足，未生成测试用例草稿。",
        });
        throw new AiWorkflowError(
          generation.output.failureReason.trim() ||
            "需求信息不足，无法生成可靠的测试用例",
        );
      }

      await onLog?.({
        level: "INFO",
        stage: AiExecutionStage.GENERATING_DRAFT,
        message: `已生成 ${generation.output.testCases.length} 条测试用例草稿，本次模型调用共使用 ${relevantCode.usage.totalTokens} Token。`,
      });

      return {
        drafts: generation.output.testCases,
        skill,
        repositories: relevantCode.repositories,
        codeReferences: relevantCode.codeReferences,
        usage: relevantCode.usage,
      };
    },
  };
}
