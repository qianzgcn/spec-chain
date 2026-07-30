import { z } from "zod";

import type { ModelProvider, ModelUsage } from "@/ai/model-provider";
import {
  buildCodeSelectionPrompt,
  buildUserStoryDraftPrompt,
} from "@/ai/prompts/generate-user-story";
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
import { AiCapability, AiExecutionStage } from "@/generated/prisma/enums";

export { AiWorkflowError } from "@/ai/workflow";
export type { WorkflowLogEvent } from "@/ai/workflow";

export const generatedUserStorySchema = z.object({
  title: z.string().trim().min(1).max(150),
  asA: z.string().trim().min(1),
  iWant: z.string().trim().min(1),
  soThat: z.string().trim().min(1),
  acceptanceCriteria: z
    .array(
      z.object({
        given: z.string().trim().min(1),
        when: z.string().trim().min(1),
        then: z.string().trim().min(1),
      }),
    )
    .min(1)
    .max(20),
  businessRules: z.string(),
  nonFunctionalRequirements: z.string(),
});

const generationDecisionSchema = z.object({
  sufficient: z.boolean(),
  failureReason: z.string(),
  userStory: generatedUserStorySchema.nullable(),
});

export type GeneratedUserStory = z.infer<typeof generatedUserStorySchema>;

export type GenerateUserStoryWorkflowInput = {
  requirementText: string;
  featureContext: string | null;
  repositories: RepositoryAccess[];
  abortSignal?: AbortSignal;
  onStage?: (stage: AiExecutionStage) => Promise<void>;
  onLog?: (event: WorkflowLogEvent) => Promise<void>;
  onRepositoriesLoaded?: (
    repositories: RepositorySnapshotRecord[],
  ) => Promise<void>;
  onCodeSelected?: (references: CodeReferenceRecord[]) => Promise<void>;
};

export type GenerateUserStoryWorkflowResult = {
  draft: GeneratedUserStory;
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

export function createGenerateUserStoryWorkflow({
  modelProvider,
  repositoryCodeSource,
  skillResolver,
}: WorkflowDependencies): AiWorkflow<
  GenerateUserStoryWorkflowInput,
  GenerateUserStoryWorkflowResult
> {
  return {
    async run({
      requirementText,
      featureContext,
      repositories,
      abortSignal,
      onStage,
      onLog,
      onRepositoriesLoaded,
      onCodeSelected,
    }) {
      const skill = skillResolver.resolve(AiCapability.GENERATE_USER_STORY);
      const relevantCode = await analyzeRelevantCode({
        requirementText,
        businessContext: featureContext,
        repositories,
        modelProvider,
        repositoryCodeSource,
        systemPrompt: skill.instructions,
        buildSelectionPrompt: ({ businessContext, ...selectionInput }) =>
          buildCodeSelectionPrompt({
            ...selectionInput,
            featureContext: businessContext,
          }),
        abortSignal,
        onStage,
        onLog,
        onRepositoriesLoaded,
        onCodeSelected,
      });

      await onStage?.(AiExecutionStage.GENERATING_DRAFT);
      const generation = await modelProvider.generateStructured({
        schema: generationDecisionSchema,
        system: skill.instructions,
        prompt: buildUserStoryDraftPrompt({
          requirementText,
          featureContext,
          codeEvidence: relevantCode.codeEvidence,
        }),
        abortSignal,
        onRetry: ({ nextAttempt, maxAttempts, reason }) =>
          onLog?.({
            level: "WARN",
            stage: AiExecutionStage.GENERATING_DRAFT,
            message: `模型返回的 US 草稿无法校验（${reason}），正在进行第 ${nextAttempt}/${maxAttempts} 次生成。`,
          }),
      });
      addUsage(relevantCode.usage, generation.usage);

      if (!generation.output.sufficient || !generation.output.userStory) {
        await onLog?.({
          level: "WARN",
          stage: AiExecutionStage.GENERATING_DRAFT,
          message: "模型判断当前需求或代码信息不足，未生成 US 草稿。",
        });
        throw new AiWorkflowError(
          generation.output.failureReason.trim() ||
            "需求信息不足，无法生成完整 US",
        );
      }
      await onLog?.({
        level: "INFO",
        stage: AiExecutionStage.GENERATING_DRAFT,
        message: `US 草稿生成完成，本次模型调用共使用 ${relevantCode.usage.totalTokens} Token。`,
      });

      return {
        draft: generation.output.userStory,
        skill,
        repositories: relevantCode.repositories,
        codeReferences: relevantCode.codeReferences,
        usage: relevantCode.usage,
      };
    },
  };
}
