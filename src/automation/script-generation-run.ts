import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { RunStatus, TestRunStage } from "@/generated/prisma/enums";
import { formatShanghaiLogTime } from "@/lib/log-time";

type AutomationRunDatabase = PrismaClient | Prisma.TransactionClient;

export type AutomationRunLogLevel = "INFO" | "WARN" | "ERROR";

export function formatAutomationRunLog(
  level: AutomationRunLogLevel,
  stage: string,
  message: string,
) {
  return `${formatShanghaiLogTime(new Date())}  ${level.padEnd(5)}  [${stage}]  ${message}`;
}

export async function appendPendingScriptGenerationRunLog(
  database: AutomationRunDatabase,
  input: {
    testCaseId: string;
    level: AutomationRunLogLevel;
    stage: string;
    message: string;
  },
) {
  const pendingRun = await database.testRun.findFirst({
    where: {
      testCaseId: input.testCaseId,
      status: RunStatus.QUEUED,
      scriptSnapshot: null,
      cancelRequestedAt: null,
      deletedAt: null,
    },
    orderBy: { queuedAt: "desc" },
    select: { id: true, logContent: true },
  });
  if (!pendingRun) return false;

  const line = formatAutomationRunLog(input.level, input.stage, input.message);
  await database.testRun.update({
    where: { id: pendingRun.id },
    data: {
      logContent: [pendingRun.logContent, line].filter(Boolean).join("\n"),
    },
  });
  return true;
}

export async function attachGeneratedScriptToPendingRun(
  database: AutomationRunDatabase,
  input: {
    testCaseId: string;
    script: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  },
) {
  const pendingRun = await database.testRun.findFirst({
    where: {
      testCaseId: input.testCaseId,
      status: RunStatus.QUEUED,
      scriptSnapshot: null,
      cancelRequestedAt: null,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!pendingRun) return false;

  await database.testRun.update({
    where: { id: pendingRun.id },
    data: {
      scriptSnapshot: input.script,
      generatedScriptInRun: true,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
    },
  });
  return true;
}

export async function failPendingScriptGenerationRun(
  database: AutomationRunDatabase,
  testCaseId: string,
  message: string,
) {
  const finishedAt = new Date();
  await database.testRun.updateMany({
    where: {
      testCaseId,
      status: RunStatus.QUEUED,
      scriptSnapshot: null,
      deletedAt: null,
    },
    data: {
      status: RunStatus.FAILED,
      stage: TestRunStage.COMPLETED,
      finishedAt,
      errorSummary: message,
    },
  });
}
