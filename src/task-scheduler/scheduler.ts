import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

import type { Prisma } from "@/generated/prisma/client";
import {
  AiCapability,
  AiExecutionOrigin,
  AiExecutionLogLevel,
  AiExecutionStage,
  AiExecutionStatus,
  RunStatus,
  TestRunStage,
} from "@/generated/prisma/enums";
import { failPendingScriptGenerationRun } from "@/automation/script-generation-run";
import {
  chooseNextBrowserTask,
  getAvailableTaskSlots,
} from "@/task-scheduler/policy";
import { taskDb, taskRuntime } from "@/task-runtime/runtime";

const LEASE_ID = "global";
const LEASE_DURATION_MS = 15_000;
const LEASE_RENEW_INTERVAL_MS = 5_000;
const POLL_INTERVAL_MS = 500;
const NORMAL_AI_CAPABILITIES = [
  AiCapability.GENERATE_USER_STORY,
  AiCapability.GENERATE_TEST_CASES,
  AiCapability.REVIEW_REQUIREMENT_IMPLEMENTATION,
];

type TaskKind = "AI" | "TEST_RUN";

type ClaimedTask = {
  kind: TaskKind;
  id: string;
  workerId: string;
};

async function tryAcquireLease(ownerId: string) {
  const expiresAt = new Date(Date.now() + LEASE_DURATION_MS);
  const existing = await taskDb.taskSchedulerLease.findUnique({
    where: { id: LEASE_ID },
    select: { id: true },
  });

  if (!existing) {
    try {
      await taskDb.taskSchedulerLease.create({
        data: { id: LEASE_ID, ownerId, expiresAt },
      });
      return true;
    } catch {
      // 并发启动的另一个调度器可能刚刚创建租约，继续尝试条件更新。
    }
  }

  const acquired = await taskDb.taskSchedulerLease.updateMany({
    where: {
      id: LEASE_ID,
      OR: [{ ownerId }, { expiresAt: { lte: new Date() } }],
    },
    data: { ownerId, expiresAt },
  });
  return acquired.count === 1;
}

async function renewLease(ownerId: string) {
  const renewed = await taskDb.taskSchedulerLease.updateMany({
    where: { id: LEASE_ID, ownerId },
    data: { expiresAt: new Date(Date.now() + LEASE_DURATION_MS) },
  });
  return renewed.count === 1;
}

async function releaseLease(ownerId: string) {
  await taskDb.taskSchedulerLease.deleteMany({
    where: { id: LEASE_ID, ownerId },
  });
}

async function appendAiFailureLog(
  transaction: Prisma.TransactionClient,
  executionId: string,
  message: string,
) {
  const latest = await transaction.aiExecutionLog.findFirst({
    where: { executionId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  await transaction.aiExecutionLog.create({
    data: {
      executionId,
      position: (latest?.position ?? -1) + 1,
      level: AiExecutionLogLevel.ERROR,
      stage: AiExecutionStage.QUEUED,
      message,
    },
  });
}

async function markWorkerFailure(task: ClaimedTask, reason: string) {
  const finishedAt = new Date();
  if (task.kind === "AI") {
    const execution = await taskDb.aiExecution.findUnique({
      where: { id: task.id },
      select: { capability: true, origin: true, testCaseId: true },
    });
    await taskDb
      .$transaction(async (transaction) => {
        const updated = await transaction.aiExecution.updateMany({
          where: {
            id: task.id,
            status: AiExecutionStatus.RUNNING,
            workerId: task.workerId,
          },
          data: {
            status: AiExecutionStatus.FAILED,
            finishedAt,
            errorMessage: reason,
            workerId: null,
          },
        });
        if (updated.count !== 1) return;
        if (
          execution?.capability === AiCapability.GENERATE_AUTOMATION_SCRIPT &&
          execution.origin === AiExecutionOrigin.TEST_RUN &&
          execution.testCaseId
        ) {
          await failPendingScriptGenerationRun(
            transaction,
            execution.testCaseId,
            reason,
          );
        }
        await appendAiFailureLog(
          transaction,
          task.id,
          `任务失败（WORKER_EXIT）：${reason}。`,
        );
      })
      .catch(() => undefined);
    return;
  }

  await taskDb.testRun.updateMany({
    where: {
      id: task.id,
      status: RunStatus.RUNNING,
      workerId: task.workerId,
    },
    data: {
      status: RunStatus.FAILED,
      stage: TestRunStage.COMPLETED,
      finishedAt,
      errorSummary: reason,
      workerId: null,
    },
  });
}

function startTaskWorker(task: ClaimedTask) {
  const workerPath = path.join(
    process.cwd(),
    "src",
    task.kind === "AI" ? "ai-worker" : "runner",
    "worker.ts",
  );

  try {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", workerPath, task.id, task.workerId],
      {
        cwd: process.cwd(),
        detached: true,
        env: process.env,
        stdio: "ignore",
        windowsHide: true,
      },
    );
    child.once("error", () => {
      void markWorkerFailure(task, "无法启动独立任务子进程");
    });
    child.once("close", () => {
      void markWorkerFailure(task, "独立任务子进程异常退出");
    });
    child.unref();
    return true;
  } catch {
    void markWorkerFailure(task, "无法启动独立任务子进程");
    return false;
  }
}

async function claimAiTask(
  capabilityFilter: readonly AiCapability[],
): Promise<ClaimedTask | null> {
  const queued = await taskDb.aiExecution.findFirst({
    where: {
      capability: { in: [...capabilityFilter] },
      status: AiExecutionStatus.QUEUED,
      deletedAt: null,
    },
    orderBy: { queuedAt: "asc" },
    select: { id: true },
  });
  if (!queued) return null;

  const workerId = randomUUID();
  const claimed = await taskDb.aiExecution.updateMany({
    where: {
      id: queued.id,
      status: AiExecutionStatus.QUEUED,
      deletedAt: null,
    },
    data: {
      status: AiExecutionStatus.RUNNING,
      startedAt: new Date(),
      workerId,
    },
  });
  return claimed.count === 1 ? { kind: "AI", id: queued.id, workerId } : null;
}

async function claimTestRun(runId: string): Promise<ClaimedTask | null> {
  const workerId = randomUUID();
  const claimed = await taskDb.testRun.updateMany({
    where: {
      id: runId,
      status: RunStatus.QUEUED,
      deletedAt: null,
    },
    data: {
      status: RunStatus.RUNNING,
      startedAt: new Date(),
      workerId,
    },
  });
  return claimed.count === 1 ? { kind: "TEST_RUN", id: runId, workerId } : null;
}

async function claimNextBrowserTask(): Promise<ClaimedTask | null> {
  const [aiTask, testRun] = await Promise.all([
    taskDb.aiExecution.findFirst({
      where: {
        capability: AiCapability.GENERATE_AUTOMATION_SCRIPT,
        status: AiExecutionStatus.QUEUED,
        deletedAt: null,
      },
      orderBy: { queuedAt: "asc" },
      select: { id: true, queuedAt: true },
    }),
    // 脚本生成任务完成前，不能让同一用例的 TestRun 绕过 AI 流程直接执行。
    taskDb.testRun.findFirst({
      where: {
        status: RunStatus.QUEUED,
        deletedAt: null,
        OR: [
          { scriptSnapshot: { not: null } },
          {
            scriptSnapshot: null,
            testCase: {
              aiExecutions: {
                none: {
                  capability: AiCapability.GENERATE_AUTOMATION_SCRIPT,
                  status: {
                    in: [AiExecutionStatus.QUEUED, AiExecutionStatus.RUNNING],
                  },
                  deletedAt: null,
                },
              },
            },
          },
        ],
      },
      orderBy: { queuedAt: "asc" },
      select: { id: true, queuedAt: true },
    }),
  ]);

  const nextTask = chooseNextBrowserTask(aiTask, testRun);
  if (!nextTask) return null;
  return nextTask.kind === "AI"
    ? claimAiTask([AiCapability.GENERATE_AUTOMATION_SCRIPT])
    : claimTestRun(nextTask.id);
}

async function fillAvailableCapacity() {
  const [runningAiTasks, runningBrowserAiTasks, runningTestRuns] =
    await Promise.all([
      taskDb.aiExecution.count({
        where: {
          capability: { in: NORMAL_AI_CAPABILITIES },
          status: AiExecutionStatus.RUNNING,
          deletedAt: null,
        },
      }),
      taskDb.aiExecution.count({
        where: {
          capability: AiCapability.GENERATE_AUTOMATION_SCRIPT,
          status: AiExecutionStatus.RUNNING,
          deletedAt: null,
        },
      }),
      taskDb.testRun.count({
        where: { status: RunStatus.RUNNING, deletedAt: null },
      }),
    ]);

  const availableAiSlots = getAvailableTaskSlots(
    taskRuntime.aiConcurrency,
    runningAiTasks,
  );
  for (let index = 0; index < availableAiSlots; index += 1) {
    const task = await claimAiTask(NORMAL_AI_CAPABILITIES);
    if (!task) break;
    startTaskWorker(task);
  }

  const runningBrowserTasks = runningBrowserAiTasks + runningTestRuns;
  const availableBrowserSlots = getAvailableTaskSlots(
    taskRuntime.browserConcurrency,
    runningBrowserTasks,
  );
  for (let index = 0; index < availableBrowserSlots; index += 1) {
    const task = await claimNextBrowserTask();
    if (!task) break;
    startTaskWorker(task);
  }
}

async function countOpenTasks() {
  const [aiCount, runCount] = await Promise.all([
    taskDb.aiExecution.count({
      where: {
        status: {
          in: [AiExecutionStatus.QUEUED, AiExecutionStatus.RUNNING],
        },
        deletedAt: null,
      },
    }),
    taskDb.testRun.count({
      where: {
        status: { in: [RunStatus.QUEUED, RunStatus.RUNNING] },
        deletedAt: null,
      },
    }),
  ]);
  return aiCount + runCount;
}

async function main() {
  const ownerId = randomUUID();
  if (!(await tryAcquireLease(ownerId))) return;

  let leaseActive = true;
  const renewal = setInterval(() => {
    void renewLease(ownerId)
      .then((renewed) => {
        leaseActive = renewed;
      })
      .catch(() => {
        leaseActive = false;
      });
  }, LEASE_RENEW_INTERVAL_MS);

  try {
    while (leaseActive) {
      await fillAvailableCapacity();
      if ((await countOpenTasks()) === 0) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        if ((await countOpenTasks()) === 0) break;
      } else {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }
  } finally {
    clearInterval(renewal);
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
    await taskDb.$disconnect();
  });
