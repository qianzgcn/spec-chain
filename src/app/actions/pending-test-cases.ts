"use server";

import { z } from "zod";

import { revalidatePath } from "next/cache";

import type { Prisma } from "@/generated/prisma/client";
import {
  AiDraftStatus,
  AiCapability,
  DraftOperation,
  TestCaseScriptSource,
  TestPriority,
  VersionSource,
} from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import {
  validateTestCaseVariableReferences,
  VariableReferenceError,
} from "@/lib/project-variables/references";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";
import { getProjectVariableMetadata } from "@/server/projects/project-variables";
import { generateBusinessCodeInTransaction } from "@/server/requirements/business-code";
import { recordTestCaseVersion } from "@/server/versions/content-version";

const idSchema = z.string().min(1);
const updateGroupSchema = z.object({
  draftId: idSchema,
  groupId: idSchema.nullable(),
});
const updatePrioritySchema = z.object({
  draftId: idSchema,
  priority: z.enum(TestPriority),
});
const updateContentSchema = z.object({
  draftId: idSchema,
  name: z.string().trim().min(1, "请输入用例名称").max(200),
  preconditions: z.string().trim().max(100_000),
  steps: z.string().trim().min(1, "测试步骤不能为空").max(100_000),
});
const confirmBatchSchema = z.object({
  draftIds: z
    .array(idSchema)
    .min(1, "请至少选择一条待评审用例")
    .max(20, "一次最多通过 20 条待评审用例")
    .refine((ids) => new Set(ids).size === ids.length, "待评审用例不能重复"),
});

class DraftStateChangedError extends Error {}

const CONFIRM_DRAFT_SELECT = {
  id: true,
  operation: true,
  baseVersion: true,
  changeReason: true,
  groupId: true,
  proposedUserStoryId: true,
  targetTestCaseId: true,
  name: true,
  priority: true,
  preconditions: true,
  steps: true,
  group: {
    select: {
      projectId: true,
      deletedAt: true,
    },
  },
  batch: {
    select: {
      sourceExecutionId: true,
      sourceExecution: {
        select: {
          sourceUserStoryId: true,
          repositorySnapshot: true,
          status: true,
          capability: true,
        },
      },
    },
  },
  targetTestCase: {
    select: {
      id: true,
      currentVersion: true,
      name: true,
      priority: true,
      preconditions: true,
      steps: true,
      script: true,
      scriptSource: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.TestCaseDraftSelect;

async function requireCurrentProjectForAction() {
  await requireUser();
  return getCurrentProject();
}

function revalidateDraftPages(input: { draftId: string; executionId: string }) {
  revalidatePath("/test-cases/pending-review");
  revalidatePath(`/test-cases/pending-review/${input.draftId}`);
  revalidatePath("/test-cases");
  revalidatePath("/test-case-groups");
  revalidatePath("/execution-tasks");
  revalidatePath(`/execution-tasks/${input.executionId}`);
}

export async function updatePendingTestCaseDraftGroupAction(
  input: unknown,
): Promise<ActionResult> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsed = updateGroupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "请选择有效的用例分组" };
  }

  const [draft, group] = await Promise.all([
    db.testCaseDraft.findFirst({
      where: {
        id: parsed.data.draftId,
        status: AiDraftStatus.PENDING,
        deletedAt: null,
        batch: {
          projectId: project.id,
          deletedAt: null,
        },
      },
      select: {
        id: true,
        batch: { select: { sourceExecutionId: true } },
      },
    }),
    parsed.data.groupId
      ? db.testCaseGroup.findFirst({
          where: {
            id: parsed.data.groupId,
            projectId: project.id,
            deletedAt: null,
          },
          select: { id: true },
        })
      : null,
  ]);

  if (!draft) {
    return { ok: false, message: "待评审用例不存在或状态已发生变化" };
  }
  if (parsed.data.groupId && !group) {
    return { ok: false, message: "所选用例分组不存在或已删除" };
  }

  const updated = await db.testCaseDraft.updateMany({
    where: {
      id: draft.id,
      status: AiDraftStatus.PENDING,
      deletedAt: null,
    },
    data: { groupId: parsed.data.groupId },
  });
  if (updated.count !== 1) {
    return { ok: false, message: "待评审用例状态已发生变化，请刷新后重试" };
  }

  revalidateDraftPages({
    draftId: draft.id,
    executionId: draft.batch.sourceExecutionId,
  });
  return { ok: true, message: "用例分组已更新" };
}

export async function updatePendingTestCaseDraftPriorityAction(
  input: unknown,
): Promise<ActionResult> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsed = updatePrioritySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "请选择有效的用例优先级" };
  }

  const draft = await db.testCaseDraft.findFirst({
    where: {
      id: parsed.data.draftId,
      status: AiDraftStatus.PENDING,
      deletedAt: null,
      batch: {
        projectId: project.id,
        deletedAt: null,
      },
    },
    select: {
      id: true,
      batch: { select: { sourceExecutionId: true } },
    },
  });
  if (!draft) {
    return { ok: false, message: "待评审用例不存在或状态已发生变化" };
  }

  const updated = await db.testCaseDraft.updateMany({
    where: {
      id: draft.id,
      status: AiDraftStatus.PENDING,
      deletedAt: null,
    },
    data: { priority: parsed.data.priority },
  });
  if (updated.count !== 1) {
    return { ok: false, message: "待评审用例状态已发生变化，请刷新后重试" };
  }

  revalidateDraftPages({
    draftId: draft.id,
    executionId: draft.batch.sourceExecutionId,
  });
  return { ok: true, message: "用例优先级已更新" };
}

export async function updatePendingTestCaseDraftContentAction(
  input: unknown,
): Promise<ActionResult> {
  const project = await requireCurrentProjectForAction();
  if (!project) return { ok: false, message: "请先创建项目" };

  const parsed = updateContentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "请检查用例内容",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const draft = await db.testCaseDraft.findFirst({
    where: {
      id: parsed.data.draftId,
      status: AiDraftStatus.PENDING,
      operation: { not: DraftOperation.RETIRE },
      deletedAt: null,
      batch: { projectId: project.id, deletedAt: null },
    },
    select: {
      id: true,
      batch: { select: { sourceExecutionId: true } },
    },
  });
  if (!draft) {
    return { ok: false, message: "待评审用例不存在或不能编辑" };
  }
  const variables = await getProjectVariableMetadata(project.id);
  try {
    validateTestCaseVariableReferences({
      preconditions: parsed.data.preconditions || null,
      steps: parsed.data.steps,
      variables,
    });
  } catch (error) {
    if (!(error instanceof VariableReferenceError)) throw error;
    return { ok: false, message: `用例变量引用无效：${error.message}` };
  }

  const updated = await db.testCaseDraft.updateMany({
    where: {
      id: draft.id,
      status: AiDraftStatus.PENDING,
      deletedAt: null,
    },
    data: {
      name: parsed.data.name,
      preconditions: parsed.data.preconditions || null,
      steps: parsed.data.steps,
    },
  });
  if (updated.count !== 1) {
    return { ok: false, message: "待评审用例状态已变化，请刷新后重试" };
  }
  revalidateDraftPages({
    draftId: draft.id,
    executionId: draft.batch.sourceExecutionId,
  });
  return { ok: true, message: "建议内容已保存" };
}

type ProjectVariableMetadata = Awaited<
  ReturnType<typeof getProjectVariableMetadata>
>;

async function confirmPendingDrafts(
  projectId: string,
  draftIds: string[],
  variables: ProjectVariableMetadata,
  reviewerId: string,
) {
  return db.$transaction(async (transaction) => {
    const drafts = await transaction.testCaseDraft.findMany({
      where: {
        id: { in: draftIds },
        status: AiDraftStatus.PENDING,
        deletedAt: null,
        batch: {
          projectId,
          deletedAt: null,
        },
      },
      select: CONFIRM_DRAFT_SELECT,
    });
    if (drafts.length !== draftIds.length) {
      return {
        ok: false as const,
        message: "部分待评审用例不存在或状态已发生变化，请刷新后重试",
      };
    }

    const draftsById = new Map(drafts.map((draft) => [draft.id, draft]));
    const orderedDrafts = draftIds.map((draftId) => draftsById.get(draftId));
    if (orderedDrafts.some((draft) => !draft)) {
      return {
        ok: false as const,
        message: "部分待评审用例不存在或状态已发生变化，请刷新后重试",
      };
    }

    for (const draft of orderedDrafts) {
      if (!draft) continue;
      if (draft.batch.sourceExecution.status !== "SUCCEEDED") {
        return { ok: false as const, message: "来源任务尚未成功完成" };
      }
      if (draft.operation !== DraftOperation.RETIRE && !draft.groupId) {
        return { ok: false as const, message: "请先为选中的用例选择分组" };
      }
      if (
        draft.operation !== DraftOperation.RETIRE &&
        (!draft.group ||
          draft.group.projectId !== projectId ||
          draft.group.deletedAt)
      ) {
        return {
          ok: false as const,
          message: "所选用例分组不存在或已删除",
        };
      }
      if (draft.operation !== DraftOperation.CREATE) {
        if (
          !draft.targetTestCase ||
          draft.targetTestCase.deletedAt ||
          draft.targetTestCase.currentVersion !== draft.baseVersion
        ) {
          await transaction.testCaseDraft.updateMany({
            where: {
              id: draft.id,
              status: AiDraftStatus.PENDING,
              deletedAt: null,
            },
            data: { status: AiDraftStatus.SUPERSEDED },
          });
          return {
            ok: false as const,
            message: `“${draft.name}”的正式用例已更新，该草稿已过期`,
          };
        }
      }
      if (draft.operation === DraftOperation.RETIRE) continue;
      try {
        validateTestCaseVariableReferences({
          preconditions: draft.preconditions,
          steps: draft.steps,
          variables,
        });
      } catch (error) {
        if (!(error instanceof VariableReferenceError)) throw error;
        return {
          ok: false as const,
          message: `用例变量引用无效：${error.message}`,
        };
      }
    }

    const testCaseIds: string[] = [];
    const executionIds = new Set<string>();

    for (const draft of orderedDrafts) {
      if (!draft) continue;
      const sourceExecution = draft.batch.sourceExecution;
      const proposedUserStoryId =
        draft.proposedUserStoryId ?? sourceExecution.sourceUserStoryId;
      let testCase: { id: string };

      if (draft.operation === DraftOperation.CREATE) {
        if (!draft.groupId) continue;
        testCase = await transaction.testCase.create({
          data: {
            projectId,
            groupId: draft.groupId,
            userStoryId: proposedUserStoryId,
            code: await generateBusinessCodeInTransaction(transaction, "TC"),
            name: draft.name,
            priority: draft.priority,
            preconditions: draft.preconditions,
            steps: draft.steps,
            enabled: true,
            script: null,
          },
          select: { id: true },
        });
        await recordTestCaseVersion(transaction, testCase.id, {
          source:
            sourceExecution.capability === AiCapability.CHECK_CONSISTENCY
              ? VersionSource.CONSISTENCY_CHECK
              : VersionSource.AI_GENERATION,
          createdById: reviewerId,
          sourceExecutionId: draft.batch.sourceExecutionId,
          repositorySnapshot: sourceExecution.repositorySnapshot,
          changeSummary: draft.changeReason,
        });
      } else if (draft.operation === DraftOperation.UPDATE) {
        if (
          !draft.targetTestCase ||
          !draft.groupId ||
          draft.baseVersion === null
        ) {
          throw new DraftStateChangedError();
        }
        const automationContentChanged =
          draft.name !== draft.targetTestCase.name ||
          draft.preconditions !== draft.targetTestCase.preconditions ||
          draft.steps !== draft.targetTestCase.steps;
        const clearManualScript =
          automationContentChanged &&
          draft.targetTestCase.scriptSource === TestCaseScriptSource.MANUAL;
        const updated = await transaction.testCase.updateMany({
          where: {
            id: draft.targetTestCase.id,
            projectId,
            deletedAt: null,
            currentVersion: draft.baseVersion,
          },
          data: {
            groupId: draft.groupId,
            userStoryId: proposedUserStoryId,
            name: draft.name,
            priority: draft.priority,
            preconditions: draft.preconditions,
            steps: draft.steps,
            currentVersion: { increment: 1 },
            ...(clearManualScript
              ? {
                  script: null,
                  scriptSource: null,
                  aiScriptFingerprint: null,
                  scriptGeneratedAt: null,
                }
              : {}),
          },
        });
        if (updated.count !== 1) throw new DraftStateChangedError();
        testCase = { id: draft.targetTestCase.id };
        await recordTestCaseVersion(transaction, testCase.id, {
          source: VersionSource.CONSISTENCY_CHECK,
          createdById: reviewerId,
          sourceExecutionId: draft.batch.sourceExecutionId,
          repositorySnapshot: sourceExecution.repositorySnapshot,
          changeSummary: draft.changeReason,
        });
      } else {
        if (!draft.targetTestCase || draft.baseVersion === null) {
          throw new DraftStateChangedError();
        }
        const retired = await transaction.testCase.updateMany({
          where: {
            id: draft.targetTestCase.id,
            projectId,
            deletedAt: null,
            currentVersion: draft.baseVersion,
          },
          data: {
            enabled: false,
            retiredAt: new Date(),
            retirementReason: draft.changeReason,
            retiredById: reviewerId,
            retirementExecutionId: draft.batch.sourceExecutionId,
          },
        });
        if (retired.count !== 1) throw new DraftStateChangedError();
        testCase = { id: draft.targetTestCase.id };
      }
      const confirmed = await transaction.testCaseDraft.updateMany({
        where: {
          id: draft.id,
          status: AiDraftStatus.PENDING,
          deletedAt: null,
        },
        data: {
          status: AiDraftStatus.CONFIRMED,
          confirmedAt: new Date(),
          confirmedTestCaseId: testCase.id,
        },
      });
      if (confirmed.count !== 1) {
        throw new DraftStateChangedError();
      }

      testCaseIds.push(testCase.id);
      executionIds.add(draft.batch.sourceExecutionId);
    }

    return {
      ok: true as const,
      testCaseIds,
      executionIds: [...executionIds],
    };
  });
}

function revalidateConfirmedDrafts(executionIds: string[]) {
  revalidatePath("/test-cases/pending-review");
  revalidatePath("/test-cases");
  revalidatePath("/test-case-groups");
  revalidatePath("/execution-tasks");
  for (const executionId of executionIds) {
    revalidatePath(`/execution-tasks/${executionId}`);
  }
}

export async function confirmPendingTestCaseDraftAction(
  draftId: string,
): Promise<ActionResult<{ id: string }>> {
  const project = await requireCurrentProjectForAction();
  const user = await requireUser();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsedId = idSchema.safeParse(draftId);
  if (!parsedId.success) {
    return { ok: false, message: "待评审用例无效" };
  }

  const variables = await getProjectVariableMetadata(project.id);
  try {
    const result = await confirmPendingDrafts(
      project.id,
      [parsedId.data],
      variables,
      user.id,
    );
    if (!result.ok) return result;

    revalidateConfirmedDrafts(result.executionIds);
    return {
      ok: true,
      message: "测试用例已通过评审",
      data: { id: result.testCaseIds[0] },
    };
  } catch (error) {
    if (error instanceof DraftStateChangedError) {
      return { ok: false, message: "待评审用例状态已发生变化，请刷新后重试" };
    }
    throw error;
  }
}

export async function confirmPendingTestCaseDraftsAction(
  input: unknown,
): Promise<ActionResult<{ ids: string[] }>> {
  const project = await requireCurrentProjectForAction();
  const user = await requireUser();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsed = confirmBatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "请选择待评审用例",
    };
  }

  const variables = await getProjectVariableMetadata(project.id);
  try {
    const result = await confirmPendingDrafts(
      project.id,
      parsed.data.draftIds,
      variables,
      user.id,
    );
    if (!result.ok) return result;

    revalidateConfirmedDrafts(result.executionIds);
    return {
      ok: true,
      message: `已通过 ${result.testCaseIds.length} 条测试用例`,
      data: { ids: result.testCaseIds },
    };
  } catch (error) {
    if (error instanceof DraftStateChangedError) {
      return { ok: false, message: "待评审用例状态已发生变化，请刷新后重试" };
    }
    throw error;
  }
}

export async function deletePendingTestCaseDraftAction(
  draftId: string,
): Promise<ActionResult> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsedId = idSchema.safeParse(draftId);
  if (!parsedId.success) {
    return { ok: false, message: "待评审用例无效" };
  }

  const draft = await db.testCaseDraft.findFirst({
    where: {
      id: parsedId.data,
      status: AiDraftStatus.PENDING,
      deletedAt: null,
      batch: {
        projectId: project.id,
        deletedAt: null,
      },
    },
    select: {
      id: true,
      batchId: true,
      batch: { select: { sourceExecutionId: true } },
    },
  });
  if (!draft) {
    return { ok: false, message: "待评审用例不存在或状态已发生变化" };
  }

  const deletedAt = new Date();
  try {
    await db.$transaction(async (transaction) => {
      const deleted = await transaction.testCaseDraft.updateMany({
        where: {
          id: draft.id,
          status: AiDraftStatus.PENDING,
          deletedAt: null,
        },
        data: { deletedAt },
      });
      if (deleted.count !== 1) {
        throw new DraftStateChangedError();
      }

      const remaining = await transaction.testCaseDraft.count({
        where: { batchId: draft.batchId, deletedAt: null },
      });
      if (remaining === 0) {
        await transaction.testCaseDraftBatch.update({
          where: { id: draft.batchId },
          data: { deletedAt },
        });
      }
    });
  } catch (error) {
    if (error instanceof DraftStateChangedError) {
      return { ok: false, message: "待评审用例状态已发生变化，请刷新后重试" };
    }
    throw error;
  }

  revalidateDraftPages({
    draftId: draft.id,
    executionId: draft.batch.sourceExecutionId,
  });
  return { ok: true, message: "待评审用例已删除" };
}
