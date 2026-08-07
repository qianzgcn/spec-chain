import { createModelProvider, type ModelUsage } from "@/ai/model-provider";
import { resolveProjectRepositories } from "@/ai/repository-access";
import { createRepositoryCodeSource } from "@/ai/repository-code-source";
import {
  reviewRequirementImplementation,
  type ImplementationReviewDecision,
  type ImplementationReviewUserStory,
} from "@/ai/implementation-review-workflow";
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
  AcceptanceCriterionReviewStatus,
  AiCapability,
  AiExecutionLogLevel,
  AiExecutionStage,
  AiExecutionStatus,
  ImplementationFindingSeverity,
  ImplementationFindingType,
  ImplementationReviewConclusion,
  RequirementImplementationStatus,
  TestCoverageStatus,
} from "@/generated/prisma/enums";
import {
  createDeliverySpecificationFingerprint,
  createDeliverySpecificationSnapshot,
} from "@/server/delivery-versions/fingerprint";
import { decryptTaskSecret, taskDb } from "@/task-runtime/runtime";

type StoryRecord = Awaited<ReturnType<typeof loadVersionStories>>[number];

function emptyUsage(): ModelUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

function addUsage(target: ModelUsage, addition: ModelUsage) {
  target.inputTokens += addition.inputTokens;
  target.outputTokens += addition.outputTokens;
  target.totalTokens += addition.totalTokens;
}

function loadVersionStories(projectId: string, deliveryVersionId: string) {
  return taskDb.userStory.findMany({
    where: {
      projectId,
      deliveryVersionId,
      deletedAt: null,
      deliveryVersion: { deletedAt: null },
    },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      title: true,
      asA: true,
      iWant: true,
      soThat: true,
      businessRules: true,
      nonFunctionalRequirements: true,
      acceptanceCriteria: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: { position: true, given: true, when: true, then: true },
      },
      testCases: {
        where: { deletedAt: null, enabled: true },
        orderBy: { code: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          priority: true,
          preconditions: true,
          steps: true,
          enabled: true,
        },
      },
    },
  });
}

function toReviewStory(story: StoryRecord): ImplementationReviewUserStory {
  return {
    ...story,
    acceptanceCriteria: story.acceptanceCriteria.map(
      ({ given, when, then }) => ({ given, when, then }),
    ),
    testCases: story.testCases.map(
      ({ code, name, priority, preconditions, steps }) => ({
        code,
        name,
        priority,
        preconditions,
        steps,
      }),
    ),
  };
}

function createUnconfirmedDecision(
  story: StoryRecord,
  reason: string,
): ImplementationReviewDecision {
  const hasCoverage = story.testCases.length > 0;
  return {
    implementationStatus: RequirementImplementationStatus.UNCONFIRMED,
    coverageStatus: hasCoverage
      ? TestCoverageStatus.UNCONFIRMED
      : TestCoverageStatus.INSUFFICIENT,
    summary: reason,
    criteria: story.acceptanceCriteria.map((_, index) => ({
      position: index + 1,
      status: AcceptanceCriterionReviewStatus.UNCONFIRMED,
      reason,
      evidence: [],
    })),
    findings: hasCoverage
      ? []
      : [
          {
            type: ImplementationFindingType.TEST_COVERAGE_GAP,
            severity: ImplementationFindingSeverity.MAJOR,
            title: "缺少需求用例",
            detail: "当前需求没有启用的需求用例，无法证明需求已被正确验证。",
            evidence: [],
          },
        ],
  };
}

function getReviewConclusion(
  decisions: readonly ImplementationReviewDecision[],
) {
  const failingFindingTypes = new Set<ImplementationFindingType>([
    ImplementationFindingType.MISSING_IMPLEMENTATION,
    ImplementationFindingType.INCORRECT_IMPLEMENTATION,
    ImplementationFindingType.CONFIRMED_BUG,
    ImplementationFindingType.TEST_COVERAGE_GAP,
  ]);
  const uncertainFindingTypes = new Set<ImplementationFindingType>([
    ImplementationFindingType.POTENTIAL_DEFECT,
    ImplementationFindingType.REQUIREMENT_AMBIGUITY,
  ]);
  const failed = decisions.some(
    (decision) =>
      decision.implementationStatus ===
        RequirementImplementationStatus.PARTIALLY_IMPLEMENTED ||
      decision.implementationStatus ===
        RequirementImplementationStatus.NOT_IMPLEMENTED ||
      decision.coverageStatus === TestCoverageStatus.INSUFFICIENT ||
      decision.criteria.some(
        (criterion) =>
          criterion.status === AcceptanceCriterionReviewStatus.VIOLATED,
      ) ||
      decision.findings.some((finding) =>
        failingFindingTypes.has(finding.type),
      ),
  );
  if (failed) return ImplementationReviewConclusion.FAILED;

  const needsConfirmation = decisions.some(
    (decision) =>
      decision.implementationStatus ===
        RequirementImplementationStatus.UNCONFIRMED ||
      decision.coverageStatus === TestCoverageStatus.UNCONFIRMED ||
      decision.criteria.some(
        (criterion) =>
          criterion.status === AcceptanceCriterionReviewStatus.UNCONFIRMED,
      ) ||
      decision.findings.some((finding) =>
        uncertainFindingTypes.has(finding.type),
      ),
  );
  return needsConfirmation
    ? ImplementationReviewConclusion.NEEDS_CONFIRMATION
    : ImplementationReviewConclusion.PASSED;
}

function isInsufficientEvidence(error: unknown) {
  return (
    error instanceof AiWorkflowError &&
    (error.message.includes("没有在项目仓库中找到") ||
      error.message.includes("相关代码文件无法读取"))
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

async function saveReview(input: {
  execution: AiTaskExecution;
  ownerId: string;
  startedAt: Date;
  stories: StoryRecord[];
  decisions: ImplementationReviewDecision[];
  repositorySnapshot: RepositorySnapshotRecord[];
  codeReferences: CodeReferenceRecord[];
  usage: ModelUsage;
}) {
  const finishedAt = new Date();
  const specificationFingerprint = createDeliverySpecificationFingerprint(
    input.stories,
  );
  const conclusion = getReviewConclusion(input.decisions);

  await taskDb.$transaction(async (transaction) => {
    const review = await transaction.implementationReview.create({
      data: {
        executionId: input.execution.id,
        deliveryVersionId: input.execution.deliveryVersionId!,
        specificationFingerprint,
        repositorySnapshot: JSON.stringify(input.repositorySnapshot),
        conclusion,
      },
      select: { id: true },
    });

    for (const [index, story] of input.stories.entries()) {
      const decision = input.decisions[index];
      const item = await transaction.implementationReviewItem.create({
        data: {
          reviewId: review.id,
          userStoryId: story.id,
          userStoryCodeSnapshot: story.code,
          titleSnapshot: story.title,
          specificationSnapshot: createDeliverySpecificationSnapshot(story),
          implementationStatus: decision.implementationStatus,
          coverageStatus: decision.coverageStatus,
          summary: decision.summary,
        },
        select: { id: true },
      });
      await transaction.implementationReviewCriterion.createMany({
        data: decision.criteria.map((criterion) => {
          const source = story.acceptanceCriteria[criterion.position - 1];
          return {
            reviewItemId: item.id,
            position: criterion.position,
            givenSnapshot: source.given,
            whenSnapshot: source.when,
            thenSnapshot: source.then,
            status: criterion.status,
            reason: criterion.reason,
            evidence: JSON.stringify(criterion.evidence),
          };
        }),
      });
      await transaction.implementationReviewFinding.createMany({
        data: decision.findings.map((finding) => ({
          reviewItemId: item.id,
          type: finding.type,
          severity: finding.severity,
          title: finding.title,
          detail: finding.detail,
          evidence: JSON.stringify(finding.evidence),
        })),
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
        repositorySnapshot: JSON.stringify(input.repositorySnapshot),
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

    const issueCount = input.decisions.reduce(
      (total, decision) => total + decision.findings.length,
      0,
    );
    await appendCompletionLog(
      transaction,
      input.execution.id,
      `需求实现审查完成：共审查 ${input.stories.length} 条 US，发现 ${issueCount} 个问题，结论为${conclusion === ImplementationReviewConclusion.PASSED ? "通过" : conclusion === ImplementationReviewConclusion.FAILED ? "未通过" : "需人工确认"}。`,
    );
  });
}

export async function executeImplementationReviewTask(input: {
  execution: AiTaskExecution;
  ownerId: string;
  binding: AiTaskModelBinding;
  modelApiKey: string;
  startedAt: Date;
  abortSignal: AbortSignal;
  reporter: AiTaskReporter;
}) {
  if (!input.execution.deliveryVersionId) {
    throw new AiWorkflowError("需求实现审查未关联交付版本");
  }

  const stories = await loadVersionStories(
    input.execution.projectId,
    input.execution.deliveryVersionId,
  );
  if (stories.length === 0) {
    throw new AiWorkflowError("当前交付版本没有可审查的 US");
  }

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
  const skill = builtInSkillResolver.resolve(
    AiCapability.REVIEW_REQUIREMENT_IMPLEMENTATION,
  );
  const repositorySnapshot = await loadRepositorySnapshots({
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
    onRepositoriesLoaded: async (snapshot) => {
      const updated = await taskDb.aiExecution.updateMany({
        where: {
          id: input.execution.id,
          status: AiExecutionStatus.RUNNING,
          workerId: input.ownerId,
        },
        data: { repositorySnapshot: JSON.stringify(snapshot) },
      });
      if (updated.count !== 1) throw new TaskOwnershipLostError();
    },
  });

  const usage = emptyUsage();
  const codeReferences = new Map<string, CodeReferenceRecord>();
  const decisions: ImplementationReviewDecision[] = [];
  const readCache = new Map<
    string,
    Promise<Awaited<ReturnType<typeof repositoryCodeSource.readFile>>>
  >();

  await input.reporter.writeLog(
    AiExecutionLogLevel.INFO,
    input.reporter.currentStage,
    `本次将审查交付版本中的 ${stories.length} 条 US。`,
  );
  for (const [index, story] of stories.entries()) {
    await input.reporter.writeLog(
      AiExecutionLogLevel.INFO,
      input.reporter.currentStage,
      `正在审查 ${index + 1}/${stories.length}：${story.code} ${story.title}。`,
    );
    try {
      const result = await reviewRequirementImplementation({
        userStory: toReviewStory(story),
        snapshots: repositorySnapshot,
        modelProvider,
        repositoryCodeSource,
        skill,
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
      addUsage(usage, result.usage);
      addReferences(codeReferences, result.codeReferences);
      decisions.push(result.decision);
    } catch (error) {
      if (!isInsufficientEvidence(error)) throw error;
      const reason = "当前代码中没有足够的可验证证据，需人工确认实现情况。";
      decisions.push(createUnconfirmedDecision(story, reason));
      await input.reporter.writeLog(
        AiExecutionLogLevel.WARN,
        input.reporter.currentStage,
        `${story.code} 未找到足够代码证据，已标记为需人工确认。`,
      );
    }
  }

  await saveReview({
    ...input,
    stories,
    decisions,
    repositorySnapshot: repositorySnapshot.map((snapshot) => ({
      repositoryId: snapshot.repositoryId,
      provider: snapshot.provider,
      owner: snapshot.owner,
      repository: snapshot.repository,
      branch: snapshot.branch,
      commitSha: snapshot.commitSha,
    })),
    codeReferences: [...codeReferences.values()],
    usage,
  });
}
