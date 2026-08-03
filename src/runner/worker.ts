import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { resolveAutomationAuthentication } from "@/automation/authentication";
import { RunStatus, TestRunStage } from "@/generated/prisma/enums";
import { purgeExpiredArtifacts } from "@/runner/artifacts";
import {
  generateScriptForRun,
  RunStoppedError,
} from "@/runner/generate-script";
import {
  prepareRunEnvironment,
  watchRunCancellation,
} from "@/runner/run-context";
import { findRunnerTestRun } from "@/runner/run-data";
import {
  completeRun,
  executePlaywrightTest,
  failRun,
} from "@/runner/run-execution";
import {
  createRunLogWriter,
  type RunLogLevel,
  type RunLogWriter,
} from "@/runner/run-log-writer";
import { taskDb, taskRuntime } from "@/task-runtime/runtime";

async function setRunStage(input: {
  runId: string;
  workerId: string;
  stage: TestRunStage;
  label: string;
  message: string;
  logger: RunLogWriter;
  level?: RunLogLevel;
}) {
  const updated = await taskDb.testRun.updateMany({
    where: {
      id: input.runId,
      status: RunStatus.RUNNING,
      workerId: input.workerId,
    },
    data: { stage: input.stage },
  });
  if (updated.count !== 1) throw new RunStoppedError();
  input.logger.appendTaskLog(input.level ?? "INFO", input.label, input.message);
}

async function executeRun(runId: string, workerId: string) {
  const run = await findRunnerTestRun(runId);
  if (!run || run.status !== RunStatus.RUNNING || run.workerId !== workerId) {
    return;
  }

  const workDir = path.join(taskRuntime.dataDir, "runs", run.id);
  const startedAt = run.startedAt ?? new Date();
  const logger = createRunLogWriter(run.id, workerId);
  const cancellation = watchRunCancellation({
    runId: run.id,
    workerId,
    initiallyRequested: Boolean(run.cancelRequestedAt),
  });

  try {
    const { environment, variables } = prepareRunEnvironment(run, logger);
    const authentication = resolveAutomationAuthentication({
      loginMethodSource: run.testCase.project.loginMethodSource,
      loginProfile: run.testCase.loginProfile,
      variables,
    });
    await rm(workDir, { recursive: true, force: true });
    await mkdir(workDir, { recursive: true });

    let script = run.scriptSnapshot;
    if (!script) {
      if (cancellation.signal.aborted) throw new RunStoppedError();
      if (run.testCase.deletedAt) {
        throw new Error("测试用例不存在或已删除");
      }

      await setRunStage({
        runId: run.id,
        workerId,
        stage: TestRunStage.GENERATING_SCRIPT,
        label: "生成自动化脚本",
        message: "当前用例没有可直接使用的脚本，开始生成并校验脚本。",
        logger,
      });
      script = await generateScriptForRun({
        run,
        workerId,
        variables,
        authentication,
        workDir,
        stopSignal: cancellation.signal,
        logger,
      });
    }

    if (cancellation.signal.aborted) throw new RunStoppedError();
    await setRunStage({
      runId: run.id,
      workerId,
      stage: TestRunStage.RUNNING_TEST,
      label: "执行测试用例",
      message: "正在启动 Chromium 执行测试用例。",
      logger,
    });

    const result = await executePlaywrightTest({
      workDir,
      script,
      baseUrl: run.baseUrlSnapshot,
      environment,
      loginMethodSource: authentication?.loginMethodSource,
      abortSignal: cancellation.signal,
      logger,
    });
    await completeRun({
      runId: run.id,
      workerId,
      startedAt,
      workDir,
      result,
      stopRequested: cancellation.isStopRequested(),
      logger,
    });
  } catch (error) {
    await failRun({
      runId: run.id,
      workerId,
      startedAt,
      error,
      stopRequested: cancellation.isStopRequested(),
      logger,
    });
  } finally {
    cancellation.stop();
    await logger.dispose();
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function main() {
  const [runId, workerId] = process.argv.slice(2);
  if (!runId || !workerId) {
    throw new Error("缺少测试执行任务 ID 或 Worker ID");
  }

  await mkdir(taskRuntime.dataDir, { recursive: true });
  await purgeExpiredArtifacts();
  await executeRun(runId, workerId);
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
