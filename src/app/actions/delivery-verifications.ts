"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { DeliveryVerificationCaseType } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import {
  createDeliverySpecificationFingerprint,
  createRegressionFingerprint,
} from "@/server/delivery-versions/fingerprint";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";
import { loadCurrentRepositorySnapshot } from "@/server/repositories/current-snapshot";
import { startTaskScheduler } from "@/server/tasks/launcher";
import {
  createQueuedTestRun,
  failQueuedRunsAfterSchedulerError,
  TestRunCreationError,
} from "@/server/test-runs/create-run";

const previewSchema = z.object({ deliveryVersionId: z.string().min(1) });
const createBatchSchema = previewSchema.extend({
  repositorySnapshot: z.string().min(2).max(100_000),
});

const STORY_SELECT = {
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
    orderBy: { position: "asc" as const },
    select: { position: true, given: true, when: true, then: true },
  },
  testCases: {
    where: { deletedAt: null, enabled: true },
    orderBy: { code: "asc" as const },
    select: {
      id: true,
      code: true,
      name: true,
      preconditions: true,
      steps: true,
      enabled: true,
      script: true,
      scriptSource: true,
      aiScriptFingerprint: true,
      userStoryId: true,
    },
  },
};

async function getVersionScope(projectId: string, deliveryVersionId: string) {
  const version = await db.deliveryVersion.findFirst({
    where: { id: deliveryVersionId, projectId, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      userStories: {
        where: { deletedAt: null },
        orderBy: { code: "asc" },
        select: STORY_SELECT,
      },
    },
  });
  if (!version) return null;

  const platformCases = await db.testCase.findMany({
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
      name: true,
      preconditions: true,
      steps: true,
      enabled: true,
      script: true,
      scriptSource: true,
      aiScriptFingerprint: true,
      userStoryId: true,
    },
  });
  return { version, platformCases };
}

async function getContext() {
  const [user, project] = await Promise.all([
    requireUser(),
    getCurrentProject(),
  ]);
  return { user, project };
}

export type DeliveryVerificationPreview = {
  repositorySnapshot: string;
  repositories: Array<{
    owner: string;
    repository: string;
    branch: string;
    commitSha: string;
  }>;
  requirementCaseCount: number;
  platformCaseCount: number;
  uncoveredStoryCount: number;
  baseUrl: string;
};

export async function getDeliveryVerificationPreviewAction(
  input: unknown,
): Promise<ActionResult<DeliveryVerificationPreview>> {
  const { project } = await getContext();
  if (!project) return { ok: false, message: "请先创建项目" };
  if (!project.baseUrl) {
    return { ok: false, message: "请先在测试设置中配置 Base URL" };
  }
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "交付版本 ID 不正确" };

  const scope = await getVersionScope(
    project.id,
    parsed.data.deliveryVersionId,
  );
  if (!scope) return { ok: false, message: "交付版本不存在或已删除" };
  const repositorySnapshot = await loadCurrentRepositorySnapshot(project.id);
  const requirementCaseCount = scope.version.userStories.reduce(
    (count, story) => count + story.testCases.length,
    0,
  );

  return {
    ok: true,
    data: {
      repositorySnapshot: JSON.stringify(repositorySnapshot),
      repositories: repositorySnapshot.map(
        ({ owner, repository, branch, commitSha }) => ({
          owner,
          repository,
          branch,
          commitSha,
        }),
      ),
      requirementCaseCount,
      platformCaseCount: scope.platformCases.length,
      uncoveredStoryCount: scope.version.userStories.filter(
        (story) => story.testCases.length === 0,
      ).length,
      baseUrl: project.baseUrl,
    },
  };
}

export async function createDeliveryVerificationBatchAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { user, project } = await getContext();
  if (!project) return { ok: false, message: "请先创建项目" };
  if (!project.baseUrl) {
    return { ok: false, message: "请先在测试设置中配置 Base URL" };
  }
  const parsed = createBatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "交付验证参数无效" };

  const scope = await getVersionScope(
    project.id,
    parsed.data.deliveryVersionId,
  );
  if (!scope) return { ok: false, message: "交付版本不存在或已删除" };

  const repositorySnapshot = await loadCurrentRepositorySnapshot(project.id);
  if (JSON.stringify(repositorySnapshot) !== parsed.data.repositorySnapshot) {
    return { ok: false, message: "代码仓库提交已变化，请重新确认后运行" };
  }

  const requirementCases = scope.version.userStories.flatMap((story) =>
    story.testCases.map((testCase) => ({
      ...testCase,
      userStoryId: story.id,
      caseType: DeliveryVerificationCaseType.REQUIREMENT,
    })),
  );
  const platformCases = scope.platformCases.map((testCase) => ({
    ...testCase,
    userStoryId: null,
    caseType: DeliveryVerificationCaseType.PLATFORM,
  }));
  const testCases = [...requirementCases, ...platformCases];
  if (!testCases.length) {
    return { ok: false, message: "当前交付版本和项目没有可运行的启用用例" };
  }

  try {
    const created = await db.$transaction(async (transaction) => {
      const batch = await transaction.deliveryVerificationBatch.create({
        data: {
          deliveryVersionId: scope.version.id,
          requestedById: user.id,
          specificationFingerprint: createDeliverySpecificationFingerprint(
            scope.version.userStories,
          ),
          regressionFingerprint: createRegressionFingerprint(testCases),
          repositorySnapshot: parsed.data.repositorySnapshot,
          deploymentConfirmedAt: new Date(),
        },
        select: { id: true },
      });
      const runIds: string[] = [];
      const scriptTaskIds: string[] = [];
      for (const testCase of testCases) {
        const queued = await createQueuedTestRun(transaction, {
          projectId: project.id,
          testCaseId: testCase.id,
          requestedById: user.id,
          baseUrl: project.baseUrl!,
        });
        runIds.push(queued.run.id);
        if (queued.scriptTaskId) scriptTaskIds.push(queued.scriptTaskId);
        await transaction.deliveryVerificationItem.create({
          data: {
            batchId: batch.id,
            testCaseId: testCase.id,
            testRunId: queued.run.id,
            userStoryId: testCase.userStoryId,
            caseType: testCase.caseType,
            testCaseCodeSnapshot: testCase.code,
            testCaseNameSnapshot: testCase.name,
          },
        });
      }
      return { batch, runIds, scriptTaskIds };
    });

    if (!startTaskScheduler()) {
      await db.$transaction((transaction) =>
        failQueuedRunsAfterSchedulerError(transaction, created),
      );
      return { ok: false, message: "无法启动任务调度器，请查看服务日志" };
    }

    revalidatePath(`/delivery-versions/${scope.version.id}`);
    return {
      ok: true,
      message: `已创建 ${created.runIds.length} 条测试运行`,
      data: { id: created.batch.id },
    };
  } catch (error) {
    if (error instanceof TestRunCreationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}
