import { createModelProvider, type ModelUsage } from "@/ai/model-provider";
import { resolveProjectRepositories } from "@/ai/repository-access";
import { createRepositoryCodeSource } from "@/ai/repository-code-source";
import {
  checkConsistencyUnit,
  type ConsistencyTestCase,
  type ConsistencyUserStory,
} from "@/ai/consistency-workflow";
import {
  loadRepositorySnapshots,
  type CodeReferenceRecord,
  type RepositorySnapshotRecord,
} from "@/ai/relevant-code";
import { builtInSkillResolver } from "@/ai/skills";
import { AiWorkflowError } from "@/ai/workflow";
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
  AiDraftStatus,
  AiExecutionLogLevel,
  AiExecutionStage,
  AiExecutionStatus,
  ConsistencyEntityType,
  ConsistencyOutcome,
  DraftOperation,
  RequirementStatus,
} from "@/generated/prisma/enums";
import { decryptTaskSecret, taskDb } from "@/task-runtime/runtime";

type StoryRecord = Awaited<ReturnType<typeof loadEligibleUserStories>>[number];
type CaseRecord = StoryRecord["testCases"][number];

type StoryCheckResult = {
  story: StoryRecord;
  outcome: "UNCHANGED" | "UPDATE" | "NEEDS_ATTENTION";
  reason: string;
  proposed: {
    asA: string;
    iWant: string;
    soThat: string;
    businessRules: string | null;
    nonFunctionalRequirements: string | null;
    acceptanceCriteria: Array<{ given: string; when: string; then: string }>;
  } | null;
};

type TestCaseCheckResult = {
  sourceUserStoryId: string | null;
  target: CaseRecord | null;
  outcome: "UNCHANGED" | "CREATE" | "UPDATE" | "RETIRE" | "NEEDS_ATTENTION";
  reason: string;
  proposed: {
    name: string;
    priority: CaseRecord["priority"];
    groupId: string;
    preconditions: string | null;
    steps: string;
  } | null;
};

function emptyUsage(): ModelUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

function mergeUsage(target: ModelUsage, addition: ModelUsage) {
  target.inputTokens += addition.inputTokens;
  target.outputTokens += addition.outputTokens;
  target.totalTokens += addition.totalTokens;
}

function toConsistencyStory(story: StoryRecord): ConsistencyUserStory {
  return {
    id: story.id,
    code: story.code,
    title: story.title,
    currentVersion: story.currentVersion,
    asA: story.asA,
    iWant: story.iWant,
    soThat: story.soThat,
    businessRules: story.businessRules,
    nonFunctionalRequirements: story.nonFunctionalRequirements,
    acceptanceCriteria: story.acceptanceCriteria,
  };
}

function toConsistencyTestCase(testCase: CaseRecord): ConsistencyTestCase {
  return {
    id: testCase.id,
    code: testCase.code,
    currentVersion: testCase.currentVersion,
    name: testCase.name,
    priority: testCase.priority,
    groupId: testCase.group.id,
    groupName: testCase.group.name,
    preconditions: testCase.preconditions,
    steps: testCase.steps,
    enabled: testCase.enabled,
  };
}

function loadEligibleUserStories(projectId: string) {
  return taskDb.userStory.findMany({
    where: {
      projectId,
      status: {
        in: [RequirementStatus.TESTING, RequirementStatus.COMPLETED],
      },
      deletedAt: null,
    },
    orderBy: { code: "asc" },
    select: {
      id: true,
      featureId: true,
      code: true,
      title: true,
      currentVersion: true,
      asA: true,
      iWant: true,
      soThat: true,
      businessRules: true,
      nonFunctionalRequirements: true,
      acceptanceCriteria: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: { given: true, when: true, then: true },
      },
      testCases: {
        where: { deletedAt: null },
        orderBy: { code: "asc" },
        select: {
          id: true,
          code: true,
          currentVersion: true,
          name: true,
          priority: true,
          preconditions: true,
          steps: true,
          enabled: true,
          group: { select: { id: true, name: true } },
        },
      },
    },
  });
}

function loadPlatformTestCases(projectId: string) {
  return taskDb.testCase.findMany({
    where: {
      projectId,
      userStoryId: null,
      enabled: true,
      deletedAt: null,
    },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      currentVersion: true,
      name: true,
      priority: true,
      preconditions: true,
      steps: true,
      enabled: true,
      group: { select: { id: true, name: true } },
    },
  });
}

function noEvidenceResults(input: {
  story: StoryRecord | null;
  activeCases: CaseRecord[];
  reason: string;
}) {
  return {
    story: input.story
      ? ({
          story: input.story,
          outcome: "NEEDS_ATTENTION",
          reason: input.reason,
          proposed: null,
        } satisfies StoryCheckResult)
      : null,
    testCases: input.activeCases.map(
      (testCase) =>
        ({
          sourceUserStoryId: input.story?.id ?? null,
          target: testCase,
          outcome: "NEEDS_ATTENTION",
          reason: input.reason,
          proposed: null,
        }) satisfies TestCaseCheckResult,
    ),
  };
}

function isNoEvidenceError(error: unknown): error is AiWorkflowError {
  return (
    error instanceof AiWorkflowError &&
    error.message === "没有在项目仓库中找到与需求相关的代码"
  );
}

function addReferences(
  target: Map<string, CodeReferenceRecord>,
  references: readonly CodeReferenceRecord[],
) {
  for (const reference of references) {
    target.set(`${reference.repositoryId}:${reference.path}`, reference);
  }
}

function toDraftOperation(outcome: TestCaseCheckResult["outcome"]) {
  switch (outcome) {
    case "CREATE":
      return DraftOperation.CREATE;
    case "UPDATE":
      return DraftOperation.UPDATE;
    case "RETIRE":
      return DraftOperation.RETIRE;
    default:
      throw new Error("当前结论不能创建待评审用例");
  }
}

async function saveConsistencyResults(input: {
  execution: AiTaskExecution;
  ownerId: string;
  startedAt: Date;
  repositorySnapshot: string;
  codeReferences: CodeReferenceRecord[];
  usage: ModelUsage;
  storyResults: StoryCheckResult[];
  testCaseResults: TestCaseCheckResult[];
}) {
  const finishedAt = new Date();
  const draftedCases = input.testCaseResults.filter(
    (result) =>
      result.outcome === "CREATE" ||
      result.outcome === "UPDATE" ||
      result.outcome === "RETIRE",
  );

  await taskDb.$transaction(async (transaction) => {
    const checkedUserStoryIds = input.storyResults.map(
      (result) => result.story.id,
    );
    const checkedTestCaseIds = input.testCaseResults.flatMap((result) =>
      result.target ? [result.target.id] : [],
    );
    if (checkedUserStoryIds.length) {
      await transaction.userStoryDraft.updateMany({
        where: {
          targetUserStoryId: { in: checkedUserStoryIds },
          status: AiDraftStatus.PENDING,
          deletedAt: null,
          sourceExecution: { capability: AiCapability.CHECK_CONSISTENCY },
        },
        data: { status: AiDraftStatus.SUPERSEDED },
      });
    }
    if (checkedTestCaseIds.length || checkedUserStoryIds.length) {
      await transaction.testCaseDraft.updateMany({
        where: {
          status: AiDraftStatus.PENDING,
          deletedAt: null,
          batch: {
            sourceExecution: { capability: AiCapability.CHECK_CONSISTENCY },
          },
          OR: [
            ...(checkedTestCaseIds.length
              ? [{ targetTestCaseId: { in: checkedTestCaseIds } }]
              : []),
            ...(checkedUserStoryIds.length
              ? [
                  {
                    operation: DraftOperation.CREATE,
                    proposedUserStoryId: { in: checkedUserStoryIds },
                  },
                ]
              : []),
          ],
        },
        data: { status: AiDraftStatus.SUPERSEDED },
      });
    }

    const batch = draftedCases.length
      ? await transaction.testCaseDraftBatch.create({
          data: {
            projectId: input.execution.projectId,
            sourceExecutionId: input.execution.id,
          },
          select: { id: true },
        })
      : null;

    for (const result of input.storyResults) {
      if (result.outcome !== "UPDATE" || !result.proposed) {
        await transaction.consistencyCheckItem.create({
          data: {
            projectId: input.execution.projectId,
            executionId: input.execution.id,
            entityType: ConsistencyEntityType.USER_STORY,
            outcome:
              result.outcome === "UNCHANGED"
                ? ConsistencyOutcome.UNCHANGED
                : ConsistencyOutcome.NEEDS_ATTENTION,
            userStoryId: result.story.id,
            reason: result.reason,
          },
        });
        continue;
      }

      const draft = await transaction.userStoryDraft.create({
        data: {
          projectId: input.execution.projectId,
          featureId: result.story.featureId,
          sourceExecutionId: input.execution.id,
          targetUserStoryId: result.story.id,
          operation: DraftOperation.UPDATE,
          baseVersion: result.story.currentVersion,
          changeReason: result.reason,
          title: result.story.title,
          asA: result.proposed.asA,
          iWant: result.proposed.iWant,
          soThat: result.proposed.soThat,
          businessRules: result.proposed.businessRules,
          nonFunctionalRequirements: result.proposed.nonFunctionalRequirements,
          acceptanceCriteria: {
            create: result.proposed.acceptanceCriteria.map(
              (criterion, position) => ({ ...criterion, position }),
            ),
          },
        },
        select: { id: true },
      });
      await transaction.consistencyCheckItem.create({
        data: {
          projectId: input.execution.projectId,
          executionId: input.execution.id,
          entityType: ConsistencyEntityType.USER_STORY,
          outcome: ConsistencyOutcome.DRAFTED,
          userStoryId: result.story.id,
          userStoryDraftId: draft.id,
          reason: result.reason,
        },
      });
    }

    let position = 0;
    for (const result of input.testCaseResults) {
      const isDraft =
        result.outcome === "CREATE" ||
        result.outcome === "UPDATE" ||
        result.outcome === "RETIRE";
      if (!isDraft || !batch) {
        await transaction.consistencyCheckItem.create({
          data: {
            projectId: input.execution.projectId,
            executionId: input.execution.id,
            entityType: ConsistencyEntityType.TEST_CASE,
            outcome:
              result.outcome === "UNCHANGED"
                ? ConsistencyOutcome.UNCHANGED
                : ConsistencyOutcome.NEEDS_ATTENTION,
            userStoryId: result.sourceUserStoryId,
            testCaseId: result.target?.id ?? null,
            reason: result.reason,
          },
        });
        continue;
      }

      const proposed = result.proposed;
      const draft = await transaction.testCaseDraft.create({
        data: {
          batchId: batch.id,
          position,
          operation: toDraftOperation(result.outcome),
          proposedUserStoryId: result.sourceUserStoryId,
          targetTestCaseId: result.target?.id ?? null,
          baseVersion: result.target?.currentVersion ?? null,
          changeReason: result.reason,
          groupId: proposed?.groupId ?? result.target?.group.id ?? null,
          name: proposed?.name ?? result.target?.name ?? "待新增用例",
          priority: proposed?.priority ?? result.target?.priority ?? "P2",
          preconditions:
            proposed?.preconditions ?? result.target?.preconditions ?? null,
          steps: proposed?.steps ?? result.target?.steps ?? "",
        },
        select: { id: true },
      });
      position += 1;
      await transaction.consistencyCheckItem.create({
        data: {
          projectId: input.execution.projectId,
          executionId: input.execution.id,
          entityType: ConsistencyEntityType.TEST_CASE,
          outcome: ConsistencyOutcome.DRAFTED,
          userStoryId: result.sourceUserStoryId,
          testCaseId: result.target?.id ?? null,
          testCaseDraftId: draft.id,
          reason: result.reason,
        },
      });
    }

    const completed = await transaction.aiExecution.updateMany({
      where: {
        id: input.execution.id,
        status: AiExecutionStatus.RUNNING,
        workerId: input.ownerId,
      },
      data: {
        status: AiExecutionStatus.SUCCEEDED,
        stage: AiExecutionStage.COMPLETED,
        repositorySnapshot: input.repositorySnapshot,
        codeReferences: JSON.stringify(input.codeReferences),
        promptTokens: input.usage.inputTokens,
        completionTokens: input.usage.outputTokens,
        totalTokens: input.usage.totalTokens,
        finishedAt,
        durationMs: finishedAt.getTime() - input.startedAt.getTime(),
        workerId: null,
      },
    });
    if (completed.count !== 1) throw new TaskOwnershipLostError();

    const unchangedCount =
      input.storyResults.filter((item) => item.outcome === "UNCHANGED").length +
      input.testCaseResults.filter((item) => item.outcome === "UNCHANGED")
        .length;
    const attentionCount =
      input.storyResults.filter((item) => item.outcome === "NEEDS_ATTENTION")
        .length +
      input.testCaseResults.filter((item) => item.outcome === "NEEDS_ATTENTION")
        .length;
    await appendCompletionLog(
      transaction,
      input.execution.id,
      `一致性检查完成：无变化 ${unchangedCount} 项，生成待评审变更 ${input.storyResults.filter((item) => item.outcome === "UPDATE").length + draftedCases.length} 项，需人工处理 ${attentionCount} 项。`,
    );
  });
}

export async function executeConsistencyTask(input: {
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
  const modelProvider = createModelProvider({
    name: input.binding.modelProfile.name,
    baseUrl: input.binding.modelProfile.baseUrl,
    modelId: input.binding.modelProfile.modelId,
    apiKey: input.modelApiKey,
  });
  const repositoryCodeSource = createRepositoryCodeSource();
  const skill = builtInSkillResolver.resolve(AiCapability.CHECK_CONSISTENCY);
  const repositoryRecords: RepositorySnapshotRecord[] = [];
  const snapshots = await loadRepositorySnapshots({
    repositories,
    repositoryCodeSource,
    abortSignal: input.abortSignal,
    onStage: input.reporter.updateStage,
    onLog: (event) =>
      input.reporter.writeLog(
        event.level === "WARN"
          ? AiExecutionLogLevel.WARN
          : AiExecutionLogLevel.INFO,
        event.stage,
        event.message,
      ),
    onRepositoriesLoaded: async (loaded) => {
      repositoryRecords.push(...loaded);
      const updated = await taskDb.aiExecution.updateMany({
        where: {
          id: input.execution.id,
          status: AiExecutionStatus.RUNNING,
          workerId: input.ownerId,
        },
        data: { repositorySnapshot: JSON.stringify(loaded) },
      });
      if (updated.count !== 1) throw new TaskOwnershipLostError();
    },
  });
  const [stories, platformCases] = await Promise.all([
    loadEligibleUserStories(input.execution.projectId),
    loadPlatformTestCases(input.execution.projectId),
  ]);
  const groups = input.execution.project.testGroups;
  const variables = input.execution.project.variables.map((variable) => ({
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
  }));
  const readCache = new Map<
    string,
    Promise<Awaited<ReturnType<typeof repositoryCodeSource.readFile>>>
  >();
  const usage = emptyUsage();
  const references = new Map<string, CodeReferenceRecord>();
  const storyResults: StoryCheckResult[] = [];
  const testCaseResults: TestCaseCheckResult[] = [];
  const totalUnits = stories.length + platformCases.length;

  await input.reporter.writeLog(
    AiExecutionLogLevel.INFO,
    input.reporter.currentStage,
    `本次将检查 ${stories.length} 条测试/完成态 US 和 ${platformCases.length} 条平台用例。`,
  );

  let unitIndex = 0;
  for (const story of stories) {
    unitIndex += 1;
    const activeCases = story.testCases.filter((testCase) => testCase.enabled);
    const inactiveCases = story.testCases.filter(
      (testCase) => !testCase.enabled,
    );
    await input.reporter.writeLog(
      AiExecutionLogLevel.INFO,
      input.reporter.currentStage,
      `正在检查 ${unitIndex}/${totalUnits}：${story.code} ${story.title}。`,
    );
    try {
      const checked = await checkConsistencyUnit({
        userStory: toConsistencyStory(story),
        activeTestCases: activeCases.map(toConsistencyTestCase),
        deduplicationTestCases: inactiveCases.map(toConsistencyTestCase),
        snapshots,
        modelProvider,
        repositoryCodeSource,
        skill,
        groups,
        variables,
        abortSignal: input.abortSignal,
        readCache,
        onStage: input.reporter.updateStage,
        onLog: (event) =>
          input.reporter.writeLog(
            event.level === "WARN"
              ? AiExecutionLogLevel.WARN
              : AiExecutionLogLevel.INFO,
            event.stage,
            event.message,
          ),
      });
      mergeUsage(usage, checked.usage);
      addReferences(references, checked.codeReferences);
      if (checked.decision.userStory) {
        storyResults.push({
          story,
          ...checked.decision.userStory,
        });
      }
      const caseById = new Map(
        activeCases.map((testCase) => [testCase.id, testCase]),
      );
      testCaseResults.push(
        ...checked.decision.testCases.map((decision) => ({
          sourceUserStoryId: story.id,
          target: decision.targetTestCaseId
            ? (caseById.get(decision.targetTestCaseId) ?? null)
            : null,
          ...decision,
        })),
      );
    } catch (error) {
      if (!isNoEvidenceError(error)) throw error;
      const reason = `无法从当前代码中取得足够证据：${error.message}`;
      const result = noEvidenceResults({ story, activeCases, reason });
      if (result.story) storyResults.push(result.story);
      testCaseResults.push(...result.testCases);
      await input.reporter.writeLog(
        AiExecutionLogLevel.WARN,
        input.reporter.currentStage,
        `${story.code} 无法可靠判断，已记为需人工处理：${error.message}`,
      );
    }
  }

  for (const platformCase of platformCases) {
    unitIndex += 1;
    await input.reporter.writeLog(
      AiExecutionLogLevel.INFO,
      input.reporter.currentStage,
      `正在检查 ${unitIndex}/${totalUnits}：${platformCase.code} ${platformCase.name}。`,
    );
    try {
      const checked = await checkConsistencyUnit({
        userStory: null,
        activeTestCases: [toConsistencyTestCase(platformCase)],
        snapshots,
        modelProvider,
        repositoryCodeSource,
        skill,
        groups,
        variables,
        abortSignal: input.abortSignal,
        readCache,
        onStage: input.reporter.updateStage,
        onLog: (event) =>
          input.reporter.writeLog(
            event.level === "WARN"
              ? AiExecutionLogLevel.WARN
              : AiExecutionLogLevel.INFO,
            event.stage,
            event.message,
          ),
      });
      mergeUsage(usage, checked.usage);
      addReferences(references, checked.codeReferences);
      testCaseResults.push(
        ...checked.decision.testCases.map((decision) => ({
          sourceUserStoryId: null,
          target: platformCase,
          ...decision,
        })),
      );
    } catch (error) {
      if (!isNoEvidenceError(error)) throw error;
      const reason = `无法从当前代码中取得足够证据：${error.message}`;
      testCaseResults.push(
        ...noEvidenceResults({
          story: null,
          activeCases: [platformCase],
          reason,
        }).testCases,
      );
      await input.reporter.writeLog(
        AiExecutionLogLevel.WARN,
        input.reporter.currentStage,
        `${platformCase.code} 无法可靠判断，已记为需人工处理：${error.message}`,
      );
    }
  }

  await saveConsistencyResults({
    ...input,
    repositorySnapshot: JSON.stringify(repositoryRecords),
    codeReferences: [...references.values()],
    usage,
    storyResults,
    testCaseResults,
  });
}
