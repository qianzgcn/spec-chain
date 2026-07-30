"use server";

import { z } from "zod";

import { revalidatePath } from "next/cache";

import { AiDraftStatus } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";
import { generateBusinessCodeInTransaction } from "@/server/requirements/business-code";

const idSchema = z.string().min(1);
const updateGroupSchema = z.object({
  draftId: idSchema,
  groupId: idSchema.nullable(),
});

class DraftStateChangedError extends Error {}

async function requireCurrentProjectForAction() {
  await requireUser();
  return getCurrentProject();
}

function revalidateDraftPages(input: { draftId: string; executionId: string }) {
  revalidatePath("/test-cases/pending-review");
  revalidatePath(`/test-cases/pending-review/${input.draftId}`);
  revalidatePath("/test-cases");
  revalidatePath("/test-case-groups");
  revalidatePath("/ai-executions");
  revalidatePath(`/ai-executions/${input.executionId}`);
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

export async function confirmPendingTestCaseDraftAction(
  draftId: string,
): Promise<ActionResult<{ id: string }>> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsedId = idSchema.safeParse(draftId);
  if (!parsedId.success) {
    return { ok: false, message: "待评审用例无效" };
  }

  try {
    const result = await db.$transaction(async (transaction) => {
      const draft = await transaction.testCaseDraft.findFirst({
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
          groupId: true,
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
                select: { sourceUserStoryId: true },
              },
            },
          },
        },
      });
      if (!draft) {
        return {
          ok: false as const,
          message: "待评审用例不存在或状态已发生变化",
        };
      }
      if (!draft.groupId) {
        return { ok: false as const, message: "请先选择用例分组" };
      }
      if (
        !draft.group ||
        draft.group.projectId !== project.id ||
        draft.group.deletedAt
      ) {
        return {
          ok: false as const,
          message: "所选用例分组不存在或已删除",
        };
      }

      const testCase = await transaction.testCase.create({
        data: {
          projectId: project.id,
          groupId: draft.groupId,
          userStoryId: draft.batch.sourceExecution.sourceUserStoryId,
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

      return {
        ok: true as const,
        draftId: draft.id,
        executionId: draft.batch.sourceExecutionId,
        testCaseId: testCase.id,
      };
    });

    if (!result.ok) return result;

    revalidateDraftPages({
      draftId: result.draftId,
      executionId: result.executionId,
    });
    return {
      ok: true,
      message: "测试用例已通过评审",
      data: { id: result.testCaseId },
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
