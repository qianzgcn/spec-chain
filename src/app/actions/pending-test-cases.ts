"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import {
  AiDraftStatus,
  AiExecutionStatus,
  TestPriority,
} from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import { isDeliveryVersionContentLocked } from "@/lib/delivery-versions/rules";
import {
  validateTestCaseVariableReferences,
  VariableReferenceError,
} from "@/lib/project-variables/references";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";
import { getProjectVariableMetadata } from "@/server/projects/project-variables";
import { generateBusinessCodeInTransaction } from "@/server/requirements/business-code";

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
  groupId: true,
  proposedUserStoryId: true,
  name: true,
  priority: true,
  preconditions: true,
  steps: true,
  group: { select: { projectId: true, deletedAt: true } },
  proposedUserStory: {
    select: {
      deletedAt: true,
      deliveryVersion: { select: { lockedAt: true, status: true } },
    },
  },
  batch: {
    select: {
      sourceExecutionId: true,
      sourceExecution: { select: { status: true } },
    },
  },
} satisfies Prisma.TestCaseDraftSelect;

type ConfirmDraft = Prisma.TestCaseDraftGetPayload<{
  select: typeof CONFIRM_DRAFT_SELECT;
}>;

async function getActionContext() {
  const [user, project] = await Promise.all([
    requireUser(),
    getCurrentProject(),
  ]);
  return { user, project };
}

function revalidateDraftPages(input: { draftId: string; executionId: string }) {
  revalidatePath("/test-cases/pending-review");
  revalidatePath(`/test-cases/pending-review/${input.draftId}`);
  revalidatePath("/test-cases");
  revalidatePath("/test-case-groups");
  revalidatePath("/delivery-versions");
  revalidatePath("/execution-tasks");
  revalidatePath(`/execution-tasks/${input.executionId}`);
}

export async function updatePendingTestCaseDraftGroupAction(
  input: unknown,
): Promise<ActionResult> {
  const { project } = await getActionContext();
  if (!project) return { ok: false, message: "请先创建项目" };
  const parsed = updateGroupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "请选择有效的用例分组" };

  const [draft, group] = await Promise.all([
    db.testCaseDraft.findFirst({
      where: {
        id: parsed.data.draftId,
        status: AiDraftStatus.PENDING,
        deletedAt: null,
        batch: { projectId: project.id, deletedAt: null },
      },
      select: { id: true, batch: { select: { sourceExecutionId: true } } },
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
  if (!draft) return { ok: false, message: "待评审用例不存在或状态已变化" };
  if (parsed.data.groupId && !group) {
    return { ok: false, message: "所选用例分组不存在或已删除" };
  }

  await db.testCaseDraft.update({
    where: { id: draft.id },
    data: { groupId: parsed.data.groupId },
  });
  revalidateDraftPages({
    draftId: draft.id,
    executionId: draft.batch.sourceExecutionId,
  });
  return { ok: true, message: "用例分组已保存" };
}

export async function updatePendingTestCaseDraftPriorityAction(
  input: unknown,
): Promise<ActionResult> {
  const { project } = await getActionContext();
  if (!project) return { ok: false, message: "请先创建项目" };
  const parsed = updatePrioritySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "请选择有效的优先级" };

  const draft = await db.testCaseDraft.findFirst({
    where: {
      id: parsed.data.draftId,
      status: AiDraftStatus.PENDING,
      deletedAt: null,
      batch: { projectId: project.id, deletedAt: null },
    },
    select: { id: true, batch: { select: { sourceExecutionId: true } } },
  });
  if (!draft) return { ok: false, message: "待评审用例不存在或状态已变化" };

  await db.testCaseDraft.update({
    where: { id: draft.id },
    data: { priority: parsed.data.priority },
  });
  revalidateDraftPages({
    draftId: draft.id,
    executionId: draft.batch.sourceExecutionId,
  });
  return { ok: true, message: "优先级已保存" };
}

export async function updatePendingTestCaseDraftContentAction(
  input: unknown,
): Promise<ActionResult> {
  const { project } = await getActionContext();
  if (!project) return { ok: false, message: "请先创建项目" };
  const parsed = updateContentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查待评审用例内容",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const draft = await db.testCaseDraft.findFirst({
    where: {
      id: parsed.data.draftId,
      status: AiDraftStatus.PENDING,
      deletedAt: null,
      batch: { projectId: project.id, deletedAt: null },
    },
    select: { id: true, batch: { select: { sourceExecutionId: true } } },
  });
  if (!draft) return { ok: false, message: "待评审用例不存在或状态已变化" };

  const variables = await getProjectVariableMetadata(project.id);
  try {
    validateTestCaseVariableReferences({
      preconditions: parsed.data.preconditions || null,
      steps: parsed.data.steps,
      variables,
    });
  } catch (error) {
    if (error instanceof VariableReferenceError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  await db.testCaseDraft.update({
    where: { id: draft.id },
    data: {
      name: parsed.data.name,
      preconditions: parsed.data.preconditions || null,
      steps: parsed.data.steps,
    },
  });
  revalidateDraftPages({
    draftId: draft.id,
    executionId: draft.batch.sourceExecutionId,
  });
  return { ok: true, message: "待评审用例已保存" };
}

function validateDraftForConfirmation(draft: ConfirmDraft, projectId: string) {
  if (!draft.groupId || !draft.group || draft.group.deletedAt) {
    return "请先为用例选择有效分组";
  }
  if (draft.group.projectId !== projectId) return "用例分组不属于当前项目";
  if (draft.batch.sourceExecution.status !== AiExecutionStatus.SUCCEEDED) {
    return "来源任务尚未成功完成";
  }
  if (draft.proposedUserStoryId) {
    if (!draft.proposedUserStory || draft.proposedUserStory.deletedAt) {
      return "关联 US 不存在或已删除";
    }
    const version = draft.proposedUserStory.deliveryVersion;
    if (isDeliveryVersionContentLocked(version)) {
      return "关联 US 所属交付版本已锁定，不能新增需求用例";
    }
  }
  return null;
}

async function confirmDrafts(draftIds: string[]): Promise<
  ActionResult<{
    confirmed: Array<{ draftId: string; testCaseId: string }>;
  }>
> {
  const { project } = await getActionContext();
  if (!project) return { ok: false, message: "请先创建项目" };

  const drafts = await db.testCaseDraft.findMany({
    where: {
      id: { in: draftIds },
      status: AiDraftStatus.PENDING,
      deletedAt: null,
      batch: { projectId: project.id, deletedAt: null },
    },
    select: CONFIRM_DRAFT_SELECT,
  });
  if (drafts.length !== draftIds.length) {
    return { ok: false, message: "部分待评审用例不存在或状态已变化" };
  }

  const ordered = draftIds.map((id) =>
    drafts.find((draft) => draft.id === id)!,
  );
  for (const draft of ordered) {
    const error = validateDraftForConfirmation(draft, project.id);
    if (error) return { ok: false, message: error };
  }

  const variables = await getProjectVariableMetadata(project.id);
  try {
    for (const draft of ordered) {
      validateTestCaseVariableReferences({
        preconditions: draft.preconditions,
        steps: draft.steps,
        variables,
      });
    }
  } catch (error) {
    if (error instanceof VariableReferenceError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  let confirmed: Array<{ draftId: string; testCaseId: string }>;
  try {
    confirmed = await db.$transaction(async (transaction) => {
      const results: Array<{ draftId: string; testCaseId: string }> = [];
      for (const draft of ordered) {
        const claimed = await transaction.testCaseDraft.updateMany({
          where: {
            id: draft.id,
            status: AiDraftStatus.PENDING,
            deletedAt: null,
            confirmedTestCaseId: null,
          },
          data: { status: AiDraftStatus.CONFIRMED, confirmedAt: new Date() },
        });
        if (claimed.count !== 1) throw new DraftStateChangedError();

        const testCase = await transaction.testCase.create({
          data: {
            projectId: project.id,
            groupId: draft.groupId!,
            userStoryId: draft.proposedUserStoryId,
            code: await generateBusinessCodeInTransaction(transaction, "TC"),
            name: draft.name,
            priority: draft.priority,
            preconditions: draft.preconditions,
            steps: draft.steps,
            enabled: true,
          },
          select: { id: true },
        });
        await transaction.testCaseDraft.update({
          where: { id: draft.id },
          data: { confirmedTestCaseId: testCase.id },
        });
        results.push({ draftId: draft.id, testCaseId: testCase.id });
      }
      return results;
    });
  } catch (error) {
    if (error instanceof DraftStateChangedError) {
      return { ok: false, message: "待评审用例状态已变化，请刷新后重试" };
    }
    throw error;
  }

  for (const draft of ordered) {
    revalidateDraftPages({
      draftId: draft.id,
      executionId: draft.batch.sourceExecutionId,
    });
  }
  return {
    ok: true,
    message:
      confirmed.length === 1
        ? "用例已通过评审"
        : `${confirmed.length} 条用例已通过评审`,
    data: { confirmed },
  };
}

export async function confirmPendingTestCaseDraftAction(
  draftId: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = idSchema.safeParse(draftId);
  if (!parsed.success) return { ok: false, message: "待评审用例无效" };
  const result = await confirmDrafts([parsed.data]);
  if (!result.ok) return result;
  if (!result.data) return { ok: false, message: "评审结果无效" };
  return {
    ok: true,
    message: result.message,
    data: { id: result.data.confirmed[0]!.testCaseId },
  };
}

export async function confirmPendingTestCaseDraftsAction(
  input: unknown,
): Promise<ActionResult<{ confirmedCount: number }>> {
  const parsed = confirmBatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "请选择待评审用例",
    };
  }
  const result = await confirmDrafts(parsed.data.draftIds);
  if (!result.ok) return result;
  if (!result.data) return { ok: false, message: "评审结果无效" };
  return {
    ok: true,
    message: result.message,
    data: { confirmedCount: result.data.confirmed.length },
  };
}

export async function deletePendingTestCaseDraftAction(
  draftId: string,
): Promise<ActionResult> {
  const { project } = await getActionContext();
  if (!project) return { ok: false, message: "请先创建项目" };
  const parsed = idSchema.safeParse(draftId);
  if (!parsed.success) return { ok: false, message: "待评审用例无效" };

  const draft = await db.testCaseDraft.findFirst({
    where: {
      id: parsed.data,
      deletedAt: null,
      batch: { projectId: project.id, deletedAt: null },
    },
    select: {
      id: true,
      status: true,
      batch: { select: { sourceExecutionId: true } },
    },
  });
  if (!draft) return { ok: false, message: "待评审用例不存在或已删除" };
  if (draft.status !== AiDraftStatus.PENDING) {
    return { ok: false, message: "已确认的用例不能删除" };
  }

  await db.testCaseDraft.update({
    where: { id: draft.id },
    data: { deletedAt: new Date() },
  });
  revalidateDraftPages({
    draftId: draft.id,
    executionId: draft.batch.sourceExecutionId,
  });
  return { ok: true, message: "待评审用例已删除" };
}
