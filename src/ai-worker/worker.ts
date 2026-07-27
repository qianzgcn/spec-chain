import { randomUUID } from "node:crypto";

import { ModelProviderError, createModelProvider } from "@/ai/model-provider";
import {
  RepositoryCodeError,
  createRepositoryCodeSource,
  type RepositoryAccess,
} from "@/ai/repository-code-source";
import { builtInSkillResolver } from "@/ai/skills";
import {
  AiWorkflowError,
  createGenerateUserStoryWorkflow,
} from "@/ai/user-story-workflow";
import { AiCapability, AiExecutionStatus } from "@/generated/prisma/enums";
import {
  GIT_PROVIDER_LABELS,
  parseRepositoryUrl,
} from "@/lib/git/repository-url";
import { aiWorkerDb, decryptAiWorkerSecret } from "@/ai-worker/runtime";

const LEASE_ID = "global";
const LEASE_DURATION_MS = 15_000;
const LEASE_RENEW_INTERVAL_MS = 5_000;
const LEASE_RETRY_INTERVAL_MS = 500;
const LEASE_RETRY_COUNT = 20;
const TASK_TIMEOUT_MS = 10 * 60 * 1_000;

function formatFeatureContext(feature: {
  code: string;
  name: string;
  summary: string;
  backgroundGoal: string;
  userStories: Array<{
    code: string;
    title: string;
    asA: string;
    iWant: string;
    soThat: string;
  }>;
}) {
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

function getSafeErrorMessage(
  error: unknown,
  timeoutSignal: AbortSignal,
  leaseSignal: AbortSignal,
) {
  if (timeoutSignal.aborted) {
    return "AI 任务运行超过 10 分钟，已自动终止";
  }
  if (leaseSignal.aborted) {
    return "AI 执行器租约丢失，任务已终止";
  }
  if (
    error instanceof ModelProviderError ||
    error instanceof RepositoryCodeError ||
    error instanceof AiWorkflowError
  ) {
    return error.message;
  }
  return "AI 任务执行失败，请稍后重试";
}

async function tryAcquireLease(ownerId: string) {
  const expiresAt = new Date(Date.now() + LEASE_DURATION_MS);
  const existing = await aiWorkerDb.aiWorkerLease.findUnique({
    where: { id: LEASE_ID },
    select: { id: true },
  });

  if (!existing) {
    try {
      await aiWorkerDb.aiWorkerLease.create({
        data: { id: LEASE_ID, ownerId, expiresAt },
      });
      return true;
    } catch {
      // 另一个 AI Worker 可能刚刚创建租约，继续尝试带过期条件的更新。
    }
  }

  const acquired = await aiWorkerDb.aiWorkerLease.updateMany({
    where: {
      id: LEASE_ID,
      OR: [{ ownerId }, { expiresAt: { lte: new Date() } }],
    },
    data: { ownerId, expiresAt },
  });
  return acquired.count === 1;
}

async function acquireLease(ownerId: string) {
  for (let attempt = 0; attempt < LEASE_RETRY_COUNT; attempt += 1) {
    if (await tryAcquireLease(ownerId)) return true;
    await new Promise((resolve) =>
      setTimeout(resolve, LEASE_RETRY_INTERVAL_MS),
    );
  }
  return false;
}

async function renewLease(ownerId: string) {
  const renewed = await aiWorkerDb.aiWorkerLease.updateMany({
    where: { id: LEASE_ID, ownerId },
    data: { expiresAt: new Date(Date.now() + LEASE_DURATION_MS) },
  });
  return renewed.count === 1;
}

async function releaseLease(ownerId: string) {
  await aiWorkerDb.aiWorkerLease.deleteMany({
    where: { id: LEASE_ID, ownerId },
  });
}

async function executeTask(
  executionId: string,
  ownerId: string,
  leaseSignal: AbortSignal,
) {
  const execution = await aiWorkerDb.aiExecution.findUnique({
    where: { id: executionId },
    include: {
      project: {
        select: {
          githubPatEncrypted: true,
          giteePatEncrypted: true,
          repositories: {
            where: { deletedAt: null },
            orderBy: { position: "asc" },
            select: {
              id: true,
              gitUrl: true,
              branch: true,
            },
          },
        },
      },
      feature: {
        select: {
          code: true,
          name: true,
          summary: true,
          backgroundGoal: true,
          deletedAt: true,
          userStories: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            select: {
              code: true,
              title: true,
              asA: true,
              iWant: true,
              soThat: true,
            },
          },
        },
      },
    },
  });
  if (!execution || execution.status !== AiExecutionStatus.RUNNING) return;

  const startedAt = execution.startedAt ?? new Date();
  const timeoutSignal = AbortSignal.timeout(TASK_TIMEOUT_MS);
  const taskSignal = AbortSignal.any([leaseSignal, timeoutSignal]);

  try {
    if (execution.capability !== AiCapability.GENERATE_USER_STORY) {
      throw new AiWorkflowError("当前 AI 任务类型不受支持");
    }
    if (
      execution.featureId &&
      (!execution.feature || execution.feature.deletedAt)
    ) {
      throw new AiWorkflowError("所属 FE 不存在或已删除");
    }
    if (execution.project.repositories.length === 0) {
      throw new AiWorkflowError("当前项目尚未配置代码仓库");
    }

    const binding = await aiWorkerDb.aiCapabilityBinding.findUnique({
      where: { capability: AiCapability.GENERATE_USER_STORY },
      include: { modelProfile: true },
    });
    if (!binding || binding.modelProfile.deletedAt) {
      throw new AiWorkflowError("管理员尚未配置生成 US 的默认模型");
    }

    let modelApiKey: string;
    try {
      modelApiKey = decryptAiWorkerSecret(binding.modelProfile.apiKeyEncrypted);
    } catch {
      throw new AiWorkflowError(
        "默认模型的 API Key 无法读取，请联系管理员重新配置",
      );
    }

    const repositories: RepositoryAccess[] = execution.project.repositories.map(
      (repository) => {
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
          return {
            ...repository,
            pat: decryptAiWorkerSecret(encryptedPat),
          };
        } catch {
          throw new AiWorkflowError(
            `${GIT_PROVIDER_LABELS[location.provider]} PAT 无法读取，请删除后重新新增`,
          );
        }
      },
    );

    const skill = builtInSkillResolver.resolve(
      AiCapability.GENERATE_USER_STORY,
    );
    await aiWorkerDb.aiExecution.update({
      where: { id: execution.id },
      data: {
        modelProfileNameSnapshot: binding.modelProfile.name,
        modelIdSnapshot: binding.modelProfile.modelId,
        skillNameSnapshot: skill.name,
        skillVersionSnapshot: skill.version,
      },
    });

    const workflow = createGenerateUserStoryWorkflow({
      modelProvider: createModelProvider({
        name: binding.modelProfile.name,
        baseUrl: binding.modelProfile.baseUrl,
        modelId: binding.modelProfile.modelId,
        apiKey: modelApiKey,
      }),
      repositoryCodeSource: createRepositoryCodeSource(),
      skillResolver: builtInSkillResolver,
    });

    const result = await workflow.run({
      requirementText: execution.requirementText,
      featureContext: execution.feature
        ? formatFeatureContext(execution.feature)
        : null,
      repositories,
      abortSignal: taskSignal,
      onStage: async (stage) => {
        await aiWorkerDb.aiExecution.updateMany({
          where: {
            id: execution.id,
            status: AiExecutionStatus.RUNNING,
            workerId: ownerId,
          },
          data: { stage },
        });
      },
      onRepositoriesLoaded: async (repositoriesSnapshot) => {
        await aiWorkerDb.aiExecution.updateMany({
          where: {
            id: execution.id,
            status: AiExecutionStatus.RUNNING,
            workerId: ownerId,
          },
          data: {
            repositorySnapshot: JSON.stringify(repositoriesSnapshot),
          },
        });
      },
      onCodeSelected: async (codeReferences) => {
        await aiWorkerDb.aiExecution.updateMany({
          where: {
            id: execution.id,
            status: AiExecutionStatus.RUNNING,
            workerId: ownerId,
          },
          data: { codeReferences: JSON.stringify(codeReferences) },
        });
      },
    });

    const finishedAt = new Date();
    await aiWorkerDb.$transaction(async (transaction) => {
      await transaction.userStoryDraft.create({
        data: {
          projectId: execution.projectId,
          featureId: execution.featureId,
          sourceExecutionId: execution.id,
          title: result.draft.title,
          asA: result.draft.asA,
          iWant: result.draft.iWant,
          soThat: result.draft.soThat,
          businessRules: result.draft.businessRules.trim() || null,
          nonFunctionalRequirements:
            result.draft.nonFunctionalRequirements.trim() || null,
          acceptanceCriteria: {
            create: result.draft.acceptanceCriteria.map(
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

      await transaction.aiExecution.update({
        where: { id: execution.id },
        data: {
          status: AiExecutionStatus.SUCCEEDED,
          stage: "COMPLETED",
          repositorySnapshot: JSON.stringify(result.repositories),
          codeReferences: JSON.stringify(result.codeReferences),
          promptTokens: result.usage.inputTokens,
          completionTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          workerId: null,
        },
      });
    });
  } catch (error) {
    const finishedAt = new Date();
    await aiWorkerDb.aiExecution.updateMany({
      where: {
        id: execution.id,
        status: AiExecutionStatus.RUNNING,
        workerId: ownerId,
      },
      data: {
        status: AiExecutionStatus.FAILED,
        errorMessage: getSafeErrorMessage(error, timeoutSignal, leaseSignal),
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        workerId: null,
      },
    });
  }
}

async function claimNextTask(ownerId: string) {
  const queued = await aiWorkerDb.aiExecution.findFirst({
    where: { status: AiExecutionStatus.QUEUED },
    orderBy: { queuedAt: "asc" },
    select: { id: true },
  });
  if (!queued) return null;

  const claimed = await aiWorkerDb.aiExecution.updateMany({
    where: { id: queued.id, status: AiExecutionStatus.QUEUED },
    data: {
      status: AiExecutionStatus.RUNNING,
      startedAt: new Date(),
      workerId: ownerId,
    },
  });
  return claimed.count === 1 ? queued.id : null;
}

async function main() {
  const ownerId = randomUUID();
  const acquired = await acquireLease(ownerId);
  if (!acquired) return;

  let leaseLost = false;
  const leaseController = new AbortController();
  const leaseRenewal = setInterval(() => {
    void renewLease(ownerId)
      .then((renewed) => {
        if (renewed) return;
        leaseLost = true;
        leaseController.abort();
      })
      .catch(() => {
        leaseLost = true;
        leaseController.abort();
      });
  }, LEASE_RENEW_INTERVAL_MS);

  try {
    while (!leaseLost) {
      const executionId = await claimNextTask(ownerId);
      if (executionId) {
        await executeTask(executionId, ownerId, leaseController.signal);
        continue;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, LEASE_RETRY_INTERVAL_MS),
      );
      const retryExecutionId = await claimNextTask(ownerId);
      if (!retryExecutionId) break;
      await executeTask(retryExecutionId, ownerId, leaseController.signal);
    }
  } finally {
    clearInterval(leaseRenewal);
    await releaseLease(ownerId).catch(() => undefined);
  }
}

void main()
  .catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await aiWorkerDb.$disconnect();
  });
