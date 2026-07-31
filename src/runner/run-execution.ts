import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { RunStatus, TestRunStage } from "@/generated/prisma/enums";
import { persistFailureScreenshot } from "@/runner/artifacts";
import {
  getAutomationGenerationErrorMessage,
  RunStoppedError,
  ScriptGenerationTimeoutError,
} from "@/runner/generate-script";
import { summarizeFailure } from "@/runner/logs";
import {
  buildPlaywrightConfig,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
} from "@/runner/playwright-config";
import type { RunLogWriter } from "@/runner/run-log-writer";
import { resolveRunStatus } from "@/runner/run-result";
import {
  runChildProcess,
  type ChildProcessResult,
} from "@/task-runtime/child-process";
import { taskDb } from "@/task-runtime/runtime";

export async function executePlaywrightTest(input: {
  workDir: string;
  script: string;
  baseUrl: string;
  environment: NodeJS.ProcessEnv;
  abortSignal: AbortSignal;
  logger: RunLogWriter;
}) {
  await Promise.all([
    writeFile(path.join(input.workDir, "test.spec.ts"), input.script, "utf8"),
    writeFile(
      path.join(input.workDir, "playwright.config.ts"),
      buildPlaywrightConfig(input.baseUrl),
      "utf8",
    ),
  ]);

  const require = createRequire(import.meta.url);
  const playwrightCli = require.resolve("@playwright/test/cli");
  const result = await runChildProcess({
    command: process.execPath,
    args: [
      playwrightCli,
      "test",
      "test.spec.ts",
      "--config=playwright.config.ts",
      "--project=chromium",
    ],
    cwd: input.workDir,
    env: input.environment,
    abortSignal: input.abortSignal,
    timeoutMs: PLAYWRIGHT_TEST_TIMEOUT_MS,
    onStdout: input.logger.appendStdout,
    onStderr: input.logger.appendStderr,
  });

  if (result.error) {
    input.logger.appendStderr(
      `\n无法启动 Playwright：${result.error.message}\n`,
    );
  }
  await input.logger.flush();
  return result;
}

function getExecutionErrorSummary(
  status: RunStatus,
  logContent: string,
  exitCode: number | null,
) {
  switch (status) {
    case RunStatus.PASSED:
      return null;
    case RunStatus.STOPPED:
      return "运行已由用户停止";
    case RunStatus.TIMED_OUT:
      return "测试执行超过 10 分钟，已自动终止";
    default:
      return summarizeFailure(logContent, exitCode);
  }
}

export async function completeRun(input: {
  runId: string;
  workerId: string;
  startedAt: Date;
  workDir: string;
  result: ChildProcessResult;
  stopRequested: boolean;
  logger: RunLogWriter;
}) {
  const finishedAt = new Date();
  const status = resolveRunStatus({
    timedOut: input.result.timedOut,
    stopRequested: input.stopRequested || input.result.aborted,
    exitCode: input.result.exitCode,
  });
  const screenshotPath =
    status === RunStatus.FAILED || status === RunStatus.TIMED_OUT
      ? await persistFailureScreenshot(input.runId, input.workDir)
      : null;
  const logContent = input.logger.getSanitizedContent();

  await taskDb.testRun.updateMany({
    where: {
      id: input.runId,
      status: RunStatus.RUNNING,
      workerId: input.workerId,
    },
    data: {
      status,
      stage: TestRunStage.COMPLETED,
      finishedAt,
      durationMs: finishedAt.getTime() - input.startedAt.getTime(),
      exitCode: input.result.exitCode,
      errorSummary: getExecutionErrorSummary(
        status,
        logContent,
        input.result.exitCode,
      ),
      logContent,
      screenshotPath,
      workerId: null,
    },
  });
}

function getRunFailure(error: unknown, stopRequested: boolean) {
  if (stopRequested || error instanceof RunStoppedError) {
    return {
      status: RunStatus.STOPPED,
      level: "WARN" as const,
      message: "运行已由用户停止",
    };
  }
  if (error instanceof ScriptGenerationTimeoutError) {
    return {
      status: RunStatus.TIMED_OUT,
      level: "ERROR" as const,
      message: error.message,
    };
  }
  return {
    status: RunStatus.FAILED,
    level: "ERROR" as const,
    message: getAutomationGenerationErrorMessage(error),
  };
}

export async function failRun(input: {
  runId: string;
  workerId: string;
  startedAt: Date;
  error: unknown;
  stopRequested: boolean;
  logger: RunLogWriter;
}) {
  const failure = getRunFailure(input.error, input.stopRequested);
  const finishedAt = new Date();

  input.logger.appendTaskLog(failure.level, "测试用例执行", failure.message);
  await input.logger.flush();
  await taskDb.testRun.updateMany({
    where: {
      id: input.runId,
      status: RunStatus.RUNNING,
      workerId: input.workerId,
    },
    data: {
      status: failure.status,
      stage: TestRunStage.COMPLETED,
      finishedAt,
      durationMs: finishedAt.getTime() - input.startedAt.getTime(),
      errorSummary: failure.message,
      logContent: input.logger.getSanitizedContent(),
      workerId: null,
    },
  });
}
