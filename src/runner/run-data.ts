import type { Prisma } from "@/generated/prisma/client";
import { taskDb } from "@/task-runtime/runtime";

const TEST_RUN_INCLUDE = {
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
      project: {
        select: {
          automationInstructions: true,
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
        },
      },
    },
  },
} satisfies Prisma.TestRunInclude;

export type RunnerTestRun = Prisma.TestRunGetPayload<{
  include: typeof TEST_RUN_INCLUDE;
}>;

export type RunnerVariable =
  RunnerTestRun["testCase"]["project"]["variables"][number] & {
    value: string;
  };

export function findRunnerTestRun(runId: string) {
  return taskDb.testRun.findFirst({
    where: { id: runId, deletedAt: null },
    include: TEST_RUN_INCLUDE,
  });
}
