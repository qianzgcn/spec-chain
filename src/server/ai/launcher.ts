import "server-only";

import path from "node:path";
import { spawn } from "node:child_process";

import { AiExecutionStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { logger } from "@/server/logger";

export function startAiQueueWorker() {
  const workerPath = path.join(process.cwd(), "src", "ai-worker", "worker.ts");

  try {
    const child = spawn(process.execPath, ["--import", "tsx", workerPath], {
      cwd: process.cwd(),
      detached: true,
      env: process.env,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", (error) => {
      logger.error({ error }, "启动 AI 队列子进程失败");
    });
    child.unref();
    return child.pid !== undefined;
  } catch (error) {
    logger.error({ error }, "启动 AI 队列子进程失败");
    return false;
  }
}

export async function recoverAiQueueState() {
  const now = new Date();

  await Promise.all([
    db.aiExecution.updateMany({
      where: { status: AiExecutionStatus.RUNNING },
      data: {
        status: AiExecutionStatus.FAILED,
        finishedAt: now,
        errorMessage: "服务重启导致 AI 任务中断",
        workerId: null,
      },
    }),
    db.aiWorkerLease.deleteMany(),
  ]);

  const queuedCount = await db.aiExecution.count({
    where: { status: AiExecutionStatus.QUEUED },
  });
  if (queuedCount > 0) {
    startAiQueueWorker();
  }
}
