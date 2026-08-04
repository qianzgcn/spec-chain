import { createModelProvider } from "@/ai/model-provider";
import {
  createRepositoryCodeSource,
  type RepositoryAccess,
} from "@/ai/repository-code-source";
import type {
  CodeReferenceRecord,
  RepositorySnapshotRecord,
} from "@/ai/relevant-code";
import { builtInSkillResolver } from "@/ai/skills";
import {
  createGenerateTestCasesWorkflow,
  type GenerateTestCasesWorkflowResult,
} from "@/ai/test-case-workflow";
import {
  createGenerateUserStoryWorkflow,
  type GenerateUserStoryWorkflowResult,
} from "@/ai/user-story-workflow";
import { AiWorkflowError, type WorkflowLogEvent } from "@/ai/workflow";
import type {
  AiTaskExecution,
  AiTaskModelBinding,
} from "@/ai-worker/task-data";
import {
  appendCompletionLog,
  type AiTaskReporter,
  TaskOwnershipLostError,
} from "@/ai-worker/task-support";
import {
  AiCapability,
  AiExecutionLogLevel,
  AiExecutionStatus,
  AiExecutionStage,
} from "@/generated/prisma/enums";
import {
  GIT_PROVIDER_LABELS,
  parseRepositoryUrl,
} from "@/lib/git/repository-url";
import { decryptTaskSecret, taskDb } from "@/task-runtime/runtime";

function formatFeatureContext(
  feature: NonNullable<AiTaskExecution["feature"]>,
) {
  const existingStories =
    feature.userStories.length === 0
      ? "暂无"
      : feature.userStories
          .map(
            (story) =>
              `- ${story.code} ${story.title}：As ${story.asA}；I want ${story.iWant}；so that ${story.soThat}`,
          )
          .join("\n");

  return `FE：${feature.code} ${feature.name}
一句话描述：${feature.summary}
业务背景与目标：
${feature.backgroundGoal}

现有 US 摘要：
${existingStories}`;
}

function resolveRepositories(execution: AiTaskExecution): RepositoryAccess[] {
  if (execution.project.repositories.length === 0) {
    throw new AiWorkflowError("当前项目尚未配置代码仓库");
  }

  return execution.project.repositories.map((repository) => {
    const location = parseRepositoryUrl(repository.gitUrl);
    const encryptedPat =
      location.provider === "GITHUB"
        ? execution.project.githubPatEncrypted
        : execution.project.giteePatEncrypted;

    if (!encryptedPat) {
      throw new AiWorkflowError(
        `当前项目尚未配置 ${GIT_PROVIDER_LABELS[location.provider]} PAT`,
      );
    }

    try {
      return { ...repository, pat: decryptTaskSecret(encryptedPat) };
    } catch {
      throw new AiWorkflowError(
        `${GIT_PROVIDER_LABELS[location.provider]} PAT 无法读取，请删除后重新新增`,
      );
    }
  });
}

async function updateExecutionSnapshot(
  executionId: string,
  ownerId: string,
  data: {
    repositorySnapshot?: string;
    codeReferences?: string;
  },
) {
  const updated = await taskDb.aiExecution.updateMany({
    where: {
      id: executionId,
      status: AiExecutionStatus.RUNNING,
      workerId: ownerId,
    },
    data,
  });
  if (updated.count !== 1) throw new TaskOwnershipLostError();
}

function completionData(
  result: {
    repositories: RepositorySnapshotRecord[];
    codeReferences: CodeReferenceRecord[];
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
  },
  startedAt: Date,
  finishedAt: Date,
) {
  return {
    status: AiExecutionStatus.SUCCEEDED,
    stage: AiExecutionStage.COMPLETED,
    repositorySnapshot: JSON.stringify(result.repositories),
    codeReferences: JSON.stringify(result.codeReferences),
    promptTokens: result.usage.inputTokens,
    completionTokens: result.usage.outputTokens,
    totalTokens: result.usage.totalTokens,
    finishedAt,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    workerId: null,
  };
}

async function saveUserStoryDraft(input: {
  execution: AiTaskExecution;
  ownerId: string;
  startedAt: Date;
  result: GenerateUserStoryWorkflowResult;
}) {
  const finishedAt = new Date();
  await taskDb.$transaction(async (transaction) => {
    await transaction.userStoryDraft.create({
      data: {
        projectId: input.execution.projectId,
        featureId: input.execution.featureId,
        sourceExecutionId: input.execution.id,
        title: input.result.draft.title,
        asA: input.result.draft.asA,
        iWant: input.result.draft.iWant,
        soThat: input.result.draft.soThat,
        businessRules: input.result.draft.businessRules.trim() || null,
        nonFunctionalRequirements:
          input.result.draft.nonFunctionalRequirements.trim() || null,
        acceptanceCriteria: {
          create: input.result.draft.acceptanceCriteria.map(
            (criterion, position) => ({
              position,
              given: criterion.given,
              when: criterion.when,
              then: criterion.then,
            }),
          ),
        },
      },
    });
    const completed = await transaction.aiExecution.updateMany({
      where: {
        id: input.execution.id,
        status: AiExecutionStatus.RUNNING,
        workerId: input.ownerId,
      },
      data: completionData(input.result, input.startedAt, finishedAt),
    });
    if (completed.count !== 1) throw new TaskOwnershipLostError();

    await appendCompletionLog(
      transaction,
      input.execution.id,
      "任务处理完成，US 草稿已保存。",
    );
  });
}

async function saveTestCaseDrafts(input: {
  execution: AiTaskExecution;
  ownerId: string;
  startedAt: Date;
  result: GenerateTestCasesWorkflowResult;
}) {
  const finishedAt = new Date();
  await taskDb.$transaction(async (transaction) => {
    const suggestedGroupIds = [
      ...new Set(
        input.result.drafts.flatMap((draft) =>
          draft.groupId ? [draft.groupId] : [],
        ),
      ),
    ];
    const activeGroupIds = new Set(
      suggestedGroupIds.length > 0
        ? (
            await transaction.testCaseGroup.findMany({
              where: {
                id: { in: suggestedGroupIds },
                projectId: input.execution.projectId,
                deletedAt: null,
              },
              select: { id: true },
            })
          ).map((group) => group.id)
        : [],
    );

    await transaction.testCaseDraftBatch.create({
      data: {
        projectId: input.execution.projectId,
        sourceExecutionId: input.execution.id,
        drafts: {
          create: input.result.drafts.map((draft, position) => ({
            position,
            name: draft.name,
            priority: draft.priority,
            preconditions: draft.preconditions.trim() || null,
            steps: draft.steps,
            groupId:
              draft.groupId && activeGroupIds.has(draft.groupId)
                ? draft.groupId
                : null,
          })),
        },
      },
    });
    const completed = await transaction.aiExecution.updateMany({
      where: {
        id: input.execution.id,
        status: AiExecutionStatus.RUNNING,
        workerId: input.ownerId,
      },
      data: completionData(input.result, input.startedAt, finishedAt),
    });
    if (completed.count !== 1) throw new TaskOwnershipLostError();

    await appendCompletionLog(
      transaction,
      input.execution.id,
      `任务处理完成，已保存 ${input.result.drafts.length} 条待评审测试用例。`,
    );
  });
}

export async function executeRepositoryTask(input: {
  execution: AiTaskExecution;
  ownerId: string;
  binding: AiTaskModelBinding;
  modelApiKey: string;
  startedAt: Date;
  abortSignal: AbortSignal;
  reporter: AiTaskReporter;
}) {
  const repositories = resolveRepositories(input.execution);
  const dependencies = {
    modelProvider: createModelProvider({
      name: input.binding.modelProfile.name,
      baseUrl: input.binding.modelProfile.baseUrl,
      modelId: input.binding.modelProfile.modelId,
      apiKey: input.modelApiKey,
    }),
    repositoryCodeSource: createRepositoryCodeSource(),
    skillResolver: builtInSkillResolver,
  };
  const callbacks = {
    abortSignal: input.abortSignal,
    onStage: input.reporter.updateStage,
    onLog: (event: WorkflowLogEvent) =>
      input.reporter.writeLog(
        event.level === "WARN"
          ? AiExecutionLogLevel.WARN
          : AiExecutionLogLevel.INFO,
        event.stage,
        event.message,
      ),
    onRepositoriesLoaded: (snapshot: RepositorySnapshotRecord[]) =>
      updateExecutionSnapshot(input.execution.id, input.ownerId, {
        repositorySnapshot: JSON.stringify(snapshot),
      }),
    onCodeSelected: (references: CodeReferenceRecord[]) =>
      updateExecutionSnapshot(input.execution.id, input.ownerId, {
        codeReferences: JSON.stringify(references),
      }),
  };

  if (input.execution.capability === AiCapability.GENERATE_USER_STORY) {
    const result = await createGenerateUserStoryWorkflow(dependencies).run({
      requirementText: input.execution.requirementText,
      featureContext: input.execution.feature
        ? formatFeatureContext(input.execution.feature)
        : null,
      repositories,
      ...callbacks,
    });
    await saveUserStoryDraft({ ...input, result });
    return;
  }

  if (input.execution.capability !== AiCapability.GENERATE_TEST_CASES) {
    throw new AiWorkflowError("不支持的仓库分析任务类型");
  }
  const result = await createGenerateTestCasesWorkflow(dependencies).run({
    requirementText: input.execution.requirementText,
    repositories,
    groups: input.execution.project.testGroups,
    variables: input.execution.project.variables.map((variable) => ({
      name: variable.name,
      kind: variable.kind,
      encrypted: variable.encrypted,
      description: variable.description,
      fields: variable.fields.map((field) => ({
        name: field.name,
        kind: field.kind,
        encrypted: field.encrypted,
        description: field.description,
      })),
    })),
    ...callbacks,
  });
  await saveTestCaseDrafts({ ...input, result });
}
