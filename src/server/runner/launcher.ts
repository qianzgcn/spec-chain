import "server-only";

import path from "node:path";
import { spawn } from "node:child_process";

import { RunStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { logger } from "@/server/logger";

export function startQueueWorker() {
  const workerPath = path.join(process.cwd(), "src", "runner", "worker.ts");

  try {
    const child = spawn(process.execPath, ["--import", "tsx", workerPath], {
      cwd: process.cwd(),
      detached: true,
      env: process.env,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", (error) => {
      logger.error({ error }, "启动运行队列子进程失败");
    });
    child.unref();
    return child.pid !== undefined;
  } catch (error) {
    logger.error({ error }, "启动运行队列子进程失败");
    return false;
  }
}

export async function recoverRunnerState() {
  const now = new Date();

  // 新服务进程启动后，旧运行器及其租约都不再有效。
  await Promise.all([
    db.testRun.updateMany({
      where: { status: RunStatus.RUNNING },
      data: {
        status: RunStatus.FAILED,
        finishedAt: now,
        errorSummary: "服务重启导致运行中断",
        workerId: null,
      },
    }),
    db.runnerLease.deleteMany(),
  ]);

  const queuedCount = await db.testRun.count({
    where: { status: RunStatus.QUEUED },
  });
  if (queuedCount > 0) {
    startQueueWorker();
  }
}
