import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import { RunStatus, VariableKind } from "@/generated/prisma/enums";
import { decryptRunnerSecret, runnerDb, runnerEnv } from "@/runner/runtime";
import {
  buildLogContent,
  redactSecrets,
  summarizeFailure,
} from "@/runner/logs";
import { resolveRunStatus } from "@/runner/run-result";

const LEASE_ID = "global";
const LEASE_DURATION_MS = 15_000;
const LEASE_RENEW_INTERVAL_MS = 5_000;
const LEASE_RETRY_INTERVAL_MS = 500;
const LEASE_RETRY_COUNT = 20;
const RUN_TIMEOUT_MS = 10 * 60 * 1_000;
const CANCEL_POLL_INTERVAL_MS = 500;

type RunningChild = ReturnType<typeof spawn>;

function buildPlaywrightConfig(baseUrl: string) {
  return `import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: ${RUN_TIMEOUT_MS},
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["line"]],
  outputDir: "./test-results",
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  use: {
    baseURL: ${JSON.stringify(baseUrl)},
    screenshot: "only-on-failure",
    trace: "off",
    video: "off",
  },
});
`;
}

async function findFirstPng(directory: string): Promise<string | null> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFirstPng(entryPath);
      if (nested) return nested;
    } else if (entry.name.toLocaleLowerCase().endsWith(".png")) {
      return entryPath;
    }
  }
  return null;
}

async function terminateProcessTree(child: RunningChild) {
  if (!child.pid || child.exitCode !== null) return;

  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn(
        "taskkill",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore" },
      );
      killer.once("close", () => resolve());
      killer.once("error", () => resolve());
    });
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }

  setTimeout(() => {
    if (child.exitCode !== null || !child.pid) return;
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }, 2_000).unref();
}

async function tryAcquireLease(ownerId: string) {
  const expiresAt = new Date(Date.now() + LEASE_DURATION_MS);
  const existing = await runnerDb.runnerLease.findUnique({
    where: { id: LEASE_ID },
    select: { id: true },
  });

  if (!existing) {
    try {
      await runnerDb.runnerLease.create({
        data: { id: LEASE_ID, ownerId, expiresAt },
      });
      return true;
    } catch {
      // 另一个进程可能刚刚创建租约，继续走带过期条件的更新。
    }
  }

  const acquired = await runnerDb.runnerLease.updateMany({
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
  const result = await runnerDb.runnerLease.updateMany({
    where: { id: LEASE_ID, ownerId },
    data: { expiresAt: new Date(Date.now() + LEASE_DURATION_MS) },
  });
  return result.count === 1;
}

async function releaseLease(ownerId: string) {
  await runnerDb.runnerLease.deleteMany({
    where: { id: LEASE_ID, ownerId },
  });
}

async function purgeExpiredArtifacts() {
  while (true) {
    const expiredRuns = await runnerDb.testRun.findMany({
      where: {
        artifactsExpireAt: { lte: new Date() },
        artifactsPurgedAt: null,
      },
      take: 100,
      select: { id: true, screenshotPath: true },
    });

    for (const run of expiredRuns) {
      if (run.screenshotPath) {
        const artifactPath = path.resolve(
          runnerEnv.dataDir,
          run.screenshotPath,
        );
        const dataRoot = `${runnerEnv.dataDir}${path.sep}`;
        if (artifactPath.startsWith(dataRoot)) {
          await rm(path.dirname(artifactPath), {
            recursive: true,
            force: true,
          }).catch(() => undefined);
        }
      }

      await runnerDb.testRun.update({
        where: { id: run.id },
        data: {
          logContent: null,
          screenshotPath: null,
          artifactsPurgedAt: new Date(),
        },
      });
    }

    if (expiredRuns.length < 100) return;
  }
}

async function persistFailureScreenshot(runId: string, tempDir: string) {
  const screenshot = await findFirstPng(path.join(tempDir, "test-results"));
  if (!screenshot) return null;

  const artifactDirectory = path.join(runnerEnv.dataDir, "artifacts", runId);
  await mkdir(artifactDirectory, { recursive: true });
  const target = path.join(artifactDirectory, "failure.png");
  await copyFile(screenshot, target);
  return path.posix.join("artifacts", runId, "failure.png");
}

async function executeRun(runId: string, ownerId: string) {
  const run = await runnerDb.testRun.findUnique({
    where: { id: runId },
    include: {
      testCase: {
        select: {
          project: {
            select: {
              variables: {
                where: { deletedAt: null },
                orderBy: { position: "asc" },
              },
            },
          },
        },
      },
    },
  });
  if (!run || run.status !== RunStatus.RUNNING) return;

  const environment: NodeJS.ProcessEnv = { ...process.env };
  const secretValues: string[] = [];
  for (const variable of run.testCase.project.variables) {
    const value =
      variable.kind === VariableKind.SECRET
        ? decryptRunnerSecret(variable.value)
        : variable.value;
    environment[variable.name] = value;
    if (variable.kind === VariableKind.SECRET) {
      secretValues.push(value);
    }
  }
  environment.BASE_URL = run.baseUrlSnapshot;

  const runsRoot = path.join(runnerEnv.dataDir, "runs");
  await mkdir(runsRoot, { recursive: true });
  const tempDir = await mkdtemp(path.join(runsRoot, `${run.id}-`));
  const startedAt = run.startedAt ?? new Date();

  let stdout = "";
  let stderr = "";
  let stopRequested = false;
  let timedOut = false;
  let leaseLost = false;
  let latestLogWrite = Promise.resolve();
  let logTimer: NodeJS.Timeout | null = null;

  const flushLogs = () => {
    if (logTimer) {
      clearTimeout(logTimer);
      logTimer = null;
    }
    const logContent = buildLogContent(stdout, stderr, secretValues);
    latestLogWrite = latestLogWrite.then(async () => {
      await runnerDb.testRun.updateMany({
        where: { id: run.id, status: RunStatus.RUNNING },
        data: { logContent },
      });
    });
    return latestLogWrite;
  };

  const scheduleLogFlush = () => {
    if (logTimer) return;
    logTimer = setTimeout(() => void flushLogs(), 300);
  };

  try {
    await Promise.all([
      writeFile(path.join(tempDir, "test.spec.ts"), run.scriptSnapshot, "utf8"),
      writeFile(
        path.join(tempDir, "playwright.config.ts"),
        buildPlaywrightConfig(run.baseUrlSnapshot),
        "utf8",
      ),
    ]);

    const require = createRequire(import.meta.url);
    const playwrightCli = require.resolve("@playwright/test/cli");
    const child = spawn(
      process.execPath,
      [
        playwrightCli,
        "test",
        "test.spec.ts",
        "--config=playwright.config.ts",
        "--project=chromium",
      ],
      {
        cwd: tempDir,
        env: environment,
        detached: true,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      scheduleLogFlush();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      scheduleLogFlush();
    });

    // 停止请求由 Web 进程写入数据库，运行器轮询后终止完整子进程树。
    let cancelCheckRunning = false;
    const cancelPoller = setInterval(() => {
      if (cancelCheckRunning) return;
      cancelCheckRunning = true;
      void runnerDb.testRun
        .findUnique({
          where: { id: run.id },
          select: { status: true, cancelRequestedAt: true },
        })
        .then(async (current) => {
          if (!current || current.status !== RunStatus.RUNNING) {
            stopRequested = true;
            await terminateProcessTree(child);
          } else if (current.cancelRequestedAt) {
            stopRequested = true;
            await terminateProcessTree(child);
          }
        })
        .finally(() => {
          cancelCheckRunning = false;
        });
    }, CANCEL_POLL_INTERVAL_MS);

    const timeout = setTimeout(() => {
      timedOut = true;
      void terminateProcessTree(child);
    }, RUN_TIMEOUT_MS);

    const leaseMonitor = setInterval(() => {
      void runnerDb.runnerLease
        .findUnique({
          where: { id: LEASE_ID },
          select: { ownerId: true },
        })
        .then(async (lease) => {
          if (lease?.ownerId === ownerId) return;
          leaseLost = true;
          await terminateProcessTree(child);
        });
    }, LEASE_RENEW_INTERVAL_MS);

    const exit = await new Promise<{
      code: number | null;
      error?: Error;
    }>((resolve) => {
      child.once("error", (error) => resolve({ code: null, error }));
      child.once("close", (code) => resolve({ code }));
    });

    clearInterval(cancelPoller);
    clearInterval(leaseMonitor);
    clearTimeout(timeout);
    if (exit.error) {
      stderr += `\n无法启动 Playwright：${exit.error.message}\n`;
    }
    await flushLogs();

    const finishedAt = new Date();
    const status = resolveRunStatus({
      timedOut,
      stopRequested,
      leaseLost,
      exitCode: exit.code,
    });
    const screenshotPath =
      status === RunStatus.FAILED || status === RunStatus.TIMED_OUT
        ? await persistFailureScreenshot(run.id, tempDir)
        : null;
    const sanitizedLog = buildLogContent(stdout, stderr, secretValues);
    const errorSummary =
      status === RunStatus.PASSED
        ? null
        : status === RunStatus.STOPPED
          ? "运行已由用户停止"
          : status === RunStatus.TIMED_OUT
            ? "运行超过 10 分钟，已自动终止"
            : leaseLost
              ? "运行器租约丢失，任务已终止"
              : summarizeFailure(sanitizedLog, exit.code);

    await runnerDb.testRun.updateMany({
      where: { id: run.id, status: RunStatus.RUNNING },
      data: {
        status,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        exitCode: exit.code,
        errorSummary,
        logContent: sanitizedLog,
        screenshotPath,
        workerId: null,
      },
    });
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : "未知运行错误";
    await runnerDb.testRun.updateMany({
      where: { id: run.id, status: RunStatus.RUNNING },
      data: {
        status: RunStatus.FAILED,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        errorSummary: `运行器错误：${message}`,
        logContent: redactSecrets(`${stderr}\n${message}`.trim(), secretValues),
        workerId: null,
      },
    });
  } finally {
    if (logTimer) clearTimeout(logTimer);
    await latestLogWrite.catch(() => undefined);
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function claimNextRun(ownerId: string) {
  const queued = await runnerDb.testRun.findFirst({
    where: { status: RunStatus.QUEUED },
    orderBy: { queuedAt: "asc" },
    select: { id: true },
  });
  if (!queued) return null;

  const startedAt = new Date();
  const claimed = await runnerDb.testRun.updateMany({
    where: { id: queued.id, status: RunStatus.QUEUED },
    data: {
      status: RunStatus.RUNNING,
      startedAt,
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
  const leaseRenewal = setInterval(() => {
    void renewLease(ownerId)
      .then((renewed) => {
        if (!renewed) leaseLost = true;
      })
      .catch(() => {
        leaseLost = true;
      });
  }, LEASE_RENEW_INTERVAL_MS);

  try {
    await mkdir(runnerEnv.dataDir, { recursive: true });
    await purgeExpiredArtifacts();

    while (!leaseLost) {
      const runId = await claimNextRun(ownerId);
      if (runId) {
        await executeRun(runId, ownerId);
        continue;
      }

      // 队列看似清空时短暂复查，避免新任务恰好落在释放租约的窗口内。
      await new Promise((resolve) =>
        setTimeout(resolve, LEASE_RETRY_INTERVAL_MS),
      );
      const retryRunId = await claimNextRun(ownerId);
      if (!retryRunId) break;
      await executeRun(retryRunId, ownerId);
    }
  } finally {
    clearInterval(leaseRenewal);
    await releaseLease(ownerId).catch(() => undefined);
  }
}

void main()
  .catch(async (error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await runnerDb.$disconnect();
  });
