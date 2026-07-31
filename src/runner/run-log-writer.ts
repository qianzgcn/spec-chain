import { formatShanghaiLogTime } from "@/lib/log-time";
import { buildLogContent, redactSecrets } from "@/runner/logs";
import { taskDb } from "@/task-runtime/runtime";

export type RunLogLevel = "INFO" | "WARN" | "ERROR";

function formatTaskLog(level: RunLogLevel, stage: string, message: string) {
  const timestamp = formatShanghaiLogTime(new Date());
  return `${timestamp}  ${level.padEnd(5)}  [${stage}]  ${message}`;
}

export function createRunLogWriter(runId: string, workerId: string) {
  const secretValues: string[] = [];
  let taskLog = "";
  let stdout = "";
  let stderr = "";
  let writeQueue = Promise.resolve();
  let flushTimer: NodeJS.Timeout | null = null;

  const currentContent = () =>
    [taskLog, buildLogContent(stdout, stderr, secretValues)]
      .filter(Boolean)
      .join("\n\n");

  const sanitizedContent = () => redactSecrets(currentContent(), secretValues);

  const flush = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    const logContent = sanitizedContent();
    const write = writeQueue.then(async () => {
      await taskDb.testRun.updateMany({
        where: { id: runId, status: "RUNNING", workerId },
        data: { logContent },
      });
    });
    writeQueue = write.catch(() => undefined);
    return write;
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => void flush(), 300);
  };

  return {
    addSecret(value: string) {
      secretValues.push(value);
    },
    appendTaskLog(level: RunLogLevel, stage: string, message: string) {
      taskLog = [taskLog, formatTaskLog(level, stage, message)]
        .filter(Boolean)
        .join("\n");
      scheduleFlush();
    },
    appendStdout(content: string) {
      stdout += content;
      scheduleFlush();
    },
    appendStderr(content: string) {
      stderr += content;
      scheduleFlush();
    },
    getSanitizedContent: sanitizedContent,
    flush,
    async dispose() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      await writeQueue.catch(() => undefined);
    },
  };
}

export type RunLogWriter = ReturnType<typeof createRunLogWriter>;
