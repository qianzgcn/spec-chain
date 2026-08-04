import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { RunStatus, TestRunStage } from "@/generated/prisma/enums";

type AutomationRunDatabase = PrismaClient | Prisma.TransactionClient;

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
