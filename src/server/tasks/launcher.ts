import "server-only";

import { rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  cleanupPlaywrightCliSession,
  cleanupSpecChainPlaywrightCliSessions,
} from "@/automation/playwright-cli-session";
import { failPendingScriptGenerationRun } from "@/automation/script-generation-run";
import {
  AiCapability,
  AiExecutionLogLevel,
  AiExecutionStage,
  AiExecutionStatus,
  RunStatus,
  TestRunStage,
} from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { logger } from "@/server/logger";

export function startTaskScheduler() {
  const schedulerPath = path.join(
    process.cwd(),
    "src",
    "task-scheduler",
    "scheduler.ts",
  );

  try {
    const child = spawn(process.execPath, ["--import", "tsx", schedulerPath], {
      cwd: process.cwd(),
      detached: true,
      env: process.env,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", (error) => {
      logger.error({ error }, "启动任务调度器失败");
    });
    child.unref();
    return child.pid !== undefined;
  } catch (error) {
    logger.error({ error }, "启动任务调度器失败");
    return false;
  }
}

export async function recoverExecutionTaskState() {
  const now = new Date();
  const dataDirectory = path.join(process.cwd(), "data");
  await cleanupSpecChainPlaywrightCliSessions(process.cwd());
  const [interruptedAiTasks, interruptedRuns] = await Promise.all([
    db.aiExecution.findMany({
      where: {
        status: AiExecutionStatus.RUNNING,
        deletedAt: null,
      },
      select: {
        id: true,
        capability: true,
        testCaseId: true,
        logs: {
          orderBy: { position: "desc" },
          take: 1,
          select: { position: true },
        },
      },
    }),
    db.testRun.findMany({
      where: { status: RunStatus.RUNNING, deletedAt: null },
      select: { id: true, startedAt: true },
    }),
  ]);

  await Promise.all([
    ...interruptedAiTasks
      .filter(
        (task) => task.capability === AiCapability.GENERATE_AUTOMATION_SCRIPT,
      )
      .map(async (task) => {
        const taskDirectory = path.join(dataDirectory, "automation", task.id);
        await cleanupPlaywrightCliSession({
          taskId: task.id,
          workDir: path.join(taskDirectory, "probe"),
        });
        await rm(taskDirectory, { recursive: true, force: true });
      }),
    ...interruptedRuns.map(async (run) => {
      const taskDirectory = path.join(dataDirectory, "runs", run.id);
      await cleanupPlaywrightCliSession({
        taskId: run.id,
        workDir: path.join(taskDirectory, "generation", "probe"),
      });
      await rm(taskDirectory, { recursive: true, force: true });
    }),
  ]);

  await db.$transaction(async (transaction) => {
    for (const task of interruptedAiTasks) {
      await transaction.aiExecution.update({
        where: { id: task.id },
        data: {
          status: AiExecutionStatus.FAILED,
          finishedAt: now,
          errorMessage: "服务重启导致任务中断",
          workerId: null,
        },
      });
      if (
        task.capability === AiCapability.GENERATE_AUTOMATION_SCRIPT &&
        task.testCaseId
      ) {
        await failPendingScriptGenerationRun(
          transaction,
          task.testCaseId,
          "服务重启导致任务中断",
        );
      }
      await transaction.aiExecutionLog.create({
        data: {
          executionId: task.id,
          position: (task.logs[0]?.position ?? -1) + 1,
          level: AiExecutionLogLevel.ERROR,
          stage: AiExecutionStage.QUEUED,
          message: "任务失败（SERVICE_RESTART）：服务重启导致任务中断。",
          createdAt: now,
        },
      });
    }

    for (const run of interruptedRuns) {
      await transaction.testRun.update({
        where: { id: run.id },
        data: {
          status: RunStatus.FAILED,
          stage: TestRunStage.COMPLETED,
          finishedAt: now,
          durationMs: run.startedAt
            ? now.getTime() - run.startedAt.getTime()
            : null,
          errorSummary: "服务重启导致任务中断",
          workerId: null,
        },
      });
    }

    await transaction.taskSchedulerLease.deleteMany();
  });

  const [queuedAiCount, queuedRunCount] = await Promise.all([
    db.aiExecution.count({
      where: { status: AiExecutionStatus.QUEUED, deletedAt: null },
    }),
    db.testRun.count({
      where: { status: RunStatus.QUEUED, deletedAt: null },
    }),
  ]);
  if (queuedAiCount + queuedRunCount > 0) {
    startTaskScheduler();
  }
}
