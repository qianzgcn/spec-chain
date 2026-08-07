import { createModelProvider } from "@/ai/model-provider";
import { resolveProjectRepositories } from "@/ai/repository-access";
import { createRepositoryCodeSource } from "@/ai/repository-code-source";
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
import type { Prisma } from "@/generated/prisma/client";
import {
  AiCapability,
  AiExecutionLogLevel,
  AiExecutionStatus,
  AiExecutionStage,
  TestCaseDraftChangeType,
} from "@/generated/prisma/enums";
import {
  createTestCaseSetFingerprint,
  createUserStoryTestDesignFingerprint,
} from "@/lib/test-cases/sync-fingerprint";
import { decryptTaskSecret, taskDb } from "@/task-runtime/runtime";

const TEST_CASE_SYNC_SOURCE_SELECT = {
  title: true,
  asA: true,
  iWant: true,
  soThat: true,
  businessRules: true,
  nonFunctionalRequirements: true,
  acceptanceCriteria: {
    where: { deletedAt: null },
    orderBy: { position: "asc" as const },
    select: { given: true, when: true, then: true },
  },
  testCases: {
    where: { deletedAt: null },
    orderBy: { code: "asc" as const },
    select: {
      id: true,
      code: true,
      groupId: true,
      name: true,
      priority: true,
      preconditions: true,
      steps: true,
      enabled: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.UserStorySelect;

async function loadCurrentTestCaseSyncSource(
  database: typeof taskDb | Prisma.TransactionClient,
  execution: AiTaskExecution,
) {
  if (!execution.sourceUserStoryId) return null;
  if (!execution.sourceFingerprint || !execution.testCaseSnapshotFingerprint) {
    throw new AiWorkflowError("测试用例任务缺少有效需求快照，请重新发起");
  }

  const source = await database.userStory.findFirst({
    where: {
      id: execution.sourceUserStoryId,
      projectId: execution.projectId,
      deletedAt: null,
    },
    select: TEST_CASE_SYNC_SOURCE_SELECT,
  });
  if (!source) throw new AiWorkflowError("来源 US 不存在或已删除");

  if (
    createUserStoryTestDesignFingerprint(source) !== execution.sourceFingerprint
  ) {
    throw new AiWorkflowError(
      "US 内容已在任务发起后发生变化，请重新发起测试用例更新",
    );
  }
  if (
    createTestCaseSetFingerprint(source.testCases) !==
    execution.testCaseSnapshotFingerprint
  ) {
    throw new AiWorkflowError(
      "关联测试用例已在任务发起后发生变化，请重新发起测试用例更新",
    );
  }
  return source;
}

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
    const source = await loadCurrentTestCaseSyncSource(
      transaction,
      input.execution,
    );
    const targetsByCode = new Map(
      source?.testCases.map((testCase) => [testCase.code, testCase]) ?? [],
    );
    const resolvedDrafts = input.result.drafts.map((draft) => {
      const target = draft.targetTestCaseCode
        ? targetsByCode.get(draft.targetTestCaseCode)
        : null;
      if (draft.changeType !== TestCaseDraftChangeType.CREATE && !target) {
        throw new AiWorkflowError(
          `目标测试用例 ${draft.targetTestCaseCode ?? "未知"} 不存在或已变化`,
        );
      }
      return { draft, target };
    });
    const suggestedGroupIds = [
      ...new Set(
        resolvedDrafts.flatMap(({ draft, target }) => {
          const groupId = draft.groupId ?? target?.groupId;
          return groupId ? [groupId] : [];
        }),
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
          create: resolvedDrafts.map(({ draft, target }, position) => {
            const deletesCase =
              draft.changeType === TestCaseDraftChangeType.DELETE;
            const proposedGroupId = draft.groupId ?? target?.groupId ?? null;
            return {
              position,
              proposedUserStoryId: input.execution.sourceUserStoryId,
              targetTestCaseId: target?.id ?? null,
              baseTestCaseUpdatedAt: target?.updatedAt ?? null,
              changeType: draft.changeType,
              changeReason: draft.changeReason,
              name: deletesCase ? target!.name : draft.name,
              priority: deletesCase ? target!.priority : draft.priority,
              preconditions: deletesCase
                ? target!.preconditions
                : draft.preconditions.trim() || null,
              steps: deletesCase ? target!.steps : draft.steps,
              groupId:
                proposedGroupId && activeGroupIds.has(proposedGroupId)
                  ? proposedGroupId
                  : null,
            };
          }),
        },
      },
    });
    if (input.execution.sourceUserStoryId) {
      await transaction.userStory.update({
        where: { id: input.execution.sourceUserStoryId },
        data: { testCasesNeedUpdate: input.result.drafts.length > 0 },
      });
    }
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
      input.result.drafts.length
        ? `任务处理完成，已保存 ${input.result.drafts.length} 条待评审测试用例变更。`
        : "任务处理完成，现有需求用例已与当前 US 保持一致。",
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
  const repositories = resolveProjectRepositories(
    input.execution.project,
    decryptTaskSecret,
  );
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
  const source = await loadCurrentTestCaseSyncSource(taskDb, input.execution);
  const allowEmptyResult = Boolean(source?.testCases.length);
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
    allowEmptyResult,
    existingTestCaseCodes: source?.testCases.map((testCase) => testCase.code),
    ...callbacks,
  });
  await saveTestCaseDrafts({ ...input, result });
}
