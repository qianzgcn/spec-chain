import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { VersionSource } from "@/generated/prisma/enums";

type VersionMetadata = {
  source: VersionSource;
  createdById?: string | null;
  sourceExecutionId?: string | null;
  repositorySnapshot?: string | null;
  changeSummary?: string | null;
};

export async function recordUserStoryVersion(
  transaction: Prisma.TransactionClient,
  userStoryId: string,
  metadata: VersionMetadata,
) {
  const story = await transaction.userStory.findUniqueOrThrow({
    where: { id: userStoryId },
    select: {
      currentVersion: true,
      title: true,
      asA: true,
      iWant: true,
      soThat: true,
      businessRules: true,
      nonFunctionalRequirements: true,
      acceptanceCriteria: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: { given: true, when: true, then: true },
      },
    },
  });

  return transaction.userStoryVersion.create({
    data: {
      userStoryId,
      version: story.currentVersion,
      title: story.title,
      asA: story.asA,
      iWant: story.iWant,
      soThat: story.soThat,
      businessRules: story.businessRules,
      nonFunctionalRequirements: story.nonFunctionalRequirements,
      source: metadata.source,
      createdById: metadata.createdById ?? null,
      sourceExecutionId: metadata.sourceExecutionId ?? null,
      repositorySnapshot: metadata.repositorySnapshot ?? null,
      changeSummary: metadata.changeSummary ?? null,
      acceptanceCriteria: {
        create: story.acceptanceCriteria.map((criterion, position) => ({
          position,
          given: criterion.given,
          when: criterion.when,
          then: criterion.then,
        })),
      },
    },
  });
}

export async function recordTestCaseVersion(
  transaction: Prisma.TransactionClient,
  testCaseId: string,
  metadata: VersionMetadata,
) {
  const testCase = await transaction.testCase.findUniqueOrThrow({
    where: { id: testCaseId },
    select: {
      currentVersion: true,
      name: true,
      priority: true,
      preconditions: true,
      steps: true,
      group: { select: { id: true, name: true } },
      userStory: { select: { id: true, code: true, title: true } },
    },
  });

  return transaction.testCaseVersion.create({
    data: {
      testCaseId,
      version: testCase.currentVersion,
      groupIdSnapshot: testCase.group.id,
      groupNameSnapshot: testCase.group.name,
      userStoryIdSnapshot: testCase.userStory?.id ?? null,
      userStoryCodeSnapshot: testCase.userStory?.code ?? null,
      userStoryTitleSnapshot: testCase.userStory?.title ?? null,
      name: testCase.name,
      priority: testCase.priority,
      preconditions: testCase.preconditions,
      steps: testCase.steps,
      source: metadata.source,
      createdById: metadata.createdById ?? null,
      sourceExecutionId: metadata.sourceExecutionId ?? null,
      repositorySnapshot: metadata.repositorySnapshot ?? null,
      changeSummary: metadata.changeSummary ?? null,
    },
  });
}
