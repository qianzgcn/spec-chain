import type { Prisma } from "@/generated/prisma/client";
import type { AiCapability } from "@/generated/prisma/enums";
import { taskDb } from "@/task-runtime/runtime";

const AI_TASK_INCLUDE = {
  project: {
    select: {
      baseUrl: true,
      automationInstructions: true,
      githubPatEncrypted: true,
      giteePatEncrypted: true,
      variables: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: {
          name: true,
          value: true,
          description: true,
          kind: true,
        },
      },
      repositories: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: {
          id: true,
          gitUrl: true,
          branch: true,
        },
      },
      testGroups: {
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  feature: {
    select: {
      code: true,
      name: true,
      summary: true,
      backgroundGoal: true,
      deletedAt: true,
      userStories: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          code: true,
          title: true,
          asA: true,
          iWant: true,
          soThat: true,
        },
      },
    },
  },
  testCase: {
    select: {
      id: true,
      code: true,
      name: true,
      preconditions: true,
      steps: true,
      script: true,
      updatedAt: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.AiExecutionInclude;

export type AiTaskExecution = Prisma.AiExecutionGetPayload<{
  include: typeof AI_TASK_INCLUDE;
}>;

export type AiTaskModelBinding = Prisma.AiCapabilityBindingGetPayload<{
  include: { modelProfile: true };
}>;

export function findAiTaskExecution(executionId: string) {
  return taskDb.aiExecution.findFirst({
    where: { id: executionId, deletedAt: null },
    include: AI_TASK_INCLUDE,
  });
}

export function findAiTaskModelBinding(capability: AiCapability) {
  return taskDb.aiCapabilityBinding.findUnique({
    where: { capability },
    include: { modelProfile: true },
  });
}
