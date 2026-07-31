import { RunStatus, VariableKind } from "@/generated/prisma/enums";
import type { RunnerTestRun, RunnerVariable } from "@/runner/run-data";
import type { RunLogWriter } from "@/runner/run-log-writer";
import { decryptTaskSecret, taskDb } from "@/task-runtime/runtime";

const CANCEL_POLL_INTERVAL_MS = 500;

export function prepareRunEnvironment(
  run: RunnerTestRun,
  logger: RunLogWriter,
) {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    BASE_URL: run.baseUrlSnapshot,
    PLAYWRIGHT_HTML_OPEN: "never",
  };
  const variables: RunnerVariable[] = run.testCase.project.variables.map(
    (variable) => {
      let value: string;
      try {
        value =
          variable.kind === VariableKind.SECRET
            ? decryptTaskSecret(variable.value)
            : variable.value;
      } catch {
        throw new Error(`项目变量 ${variable.name} 无法读取，请重新配置`);
      }

      environment[variable.name] = value;
      if (variable.kind === VariableKind.SECRET) logger.addSecret(value);
      return { ...variable, value };
    },
  );

  return { environment, variables };
}

/**
 * 每个 Runner 只轮询自己的记录，并生成独立 AbortSignal。
 * 停止某个任务时不会中断同一调度器里的其他子进程。
 */
export function watchRunCancellation(input: {
  runId: string;
  workerId: string;
  initiallyRequested: boolean;
}) {
  const controller = new AbortController();
  let stopRequested = input.initiallyRequested;
  let checking = false;

  const poller = setInterval(() => {
    if (checking) return;
    checking = true;
    void taskDb.testRun
      .findUnique({
        where: { id: input.runId },
        select: { status: true, cancelRequestedAt: true, workerId: true },
      })
      .then((current) => {
        if (
          current &&
          current.status === RunStatus.RUNNING &&
          current.workerId === input.workerId &&
          !current.cancelRequestedAt
        ) {
          return;
        }
        stopRequested = true;
        controller.abort();
      })
      .catch(() => undefined)
      .finally(() => {
        checking = false;
      });
  }, CANCEL_POLL_INTERVAL_MS);

  if (stopRequested) controller.abort();

  return {
    signal: controller.signal,
    isStopRequested: () => stopRequested,
    stop: () => clearInterval(poller),
  };
}
