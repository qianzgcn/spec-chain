import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  AiCapability,
  AiExecutionLogLevel,
  AiExecutionStage,
  AiExecutionStatus,
} from "@/generated/prisma/enums";

type AiExecutionDatabase = PrismaClient | Prisma.TransactionClient;

export function formatAutomationScriptRequirement(testCase: {
  code: string;
  name: string;
  preconditions: string | null;
  steps: string;
}) {
  return `${testCase.code} ${testCase.name}

前置条件：
${testCase.preconditions?.trim() || "无"}

测试步骤：
${testCase.steps}`;
}

export function createQueuedAiExecutionRecord(
  database: AiExecutionDatabase,
  input: {
    projectId: string;
    requestedById: string;
    capability: AiCapability;
    requirementText: string;
    featureId?: string | null;
    sourceUserStoryId?: string | null;
    testCaseId?: string | null;
  },
) {
  return database.aiExecution.create({
    data: {
      projectId: input.projectId,
      requestedById: input.requestedById,
      featureId: input.featureId ?? null,
      sourceUserStoryId: input.sourceUserStoryId ?? null,
      testCaseId: input.testCaseId ?? null,
      capability: input.capability,
      status: AiExecutionStatus.QUEUED,
      requirementText: input.requirementText,
      logs: {
        create: {
          position: 0,
          level: AiExecutionLogLevel.INFO,
          stage: AiExecutionStage.QUEUED,
          message: "任务已进入队列，等待 AI 执行器处理。",
        },
      },
    },
    select: { id: true },
  });
}
