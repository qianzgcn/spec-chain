"use server";

import { z } from "zod";

import { revalidatePath } from "next/cache";

import {
  AiCapability,
  AiDraftStatus,
  AiExecutionStatus,
  RequirementStatus,
} from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import { userStoryDraftInputSchema } from "@/lib/requirements/user-story-schema";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { startAiQueueWorker } from "@/server/ai/launcher";
import { getCurrentProject } from "@/server/projects/current-project";
import { generateBusinessCode } from "@/server/requirements/business-code";

const createExecutionSchema = z.object({
  requirementText: z
    .string()
    .trim()
    .min(1, "请输入需求内容")
    .max(10_000, "需求内容不能超过 10000 个字符"),
  featureId: z.string().nullable().optional(),
});

const idSchema = z.string().min(1);

class DraftStateChangedError extends Error {}

async function getCurrentActionContext() {
  const [user, project] = await Promise.all([
    requireUser(),
    getCurrentProject(),
  ]);
  return { user, project };
}

export async function createAiUserStoryExecutionAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { user, project } = await getCurrentActionContext();
  const parsed = createExecutionSchema.safeParse(input);
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }
  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查需求内容",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  if (parsed.data.featureId) {
    const feature = await db.feature.findFirst({
      where: {
        id: parsed.data.featureId,
        projectId: project.id,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!feature) {
      return { ok: false, message: "所属 FE 不存在或已删除" };
    }
  }

  const execution = await db.aiExecution.create({
    data: {
      projectId: project.id,
      requestedById: user.id,
      featureId: parsed.data.featureId ?? null,
      capability: AiCapability.GENERATE_USER_STORY,
      status: AiExecutionStatus.QUEUED,
      requirementText: parsed.data.requirementText,
    },
    select: { id: true },
  });

  if (!startAiQueueWorker()) {
    await db.aiExecution.update({
      where: { id: execution.id },
      data: {
        status: AiExecutionStatus.FAILED,
        finishedAt: new Date(),
        errorMessage: "无法启动 AI 队列子进程",
      },
    });
    revalidatePath("/ai-executions");
    return {
      ok: false,
      message: "无法启动 AI 队列，请查看服务日志",
    };
  }

  revalidatePath("/ai-executions");
  return {
    ok: true,
    message: "AI 任务已进入队列",
    data: execution,
  };
}

export async function updateUserStoryDraftAction(
  draftId: string,
  input: unknown,
): Promise<
  ActionResult<{
    acceptanceCriteria: Array<{
      id: string;
      given: string;
      when: string;
      then: string;
    }>;
  }>
> {
  const { project } = await getCurrentActionContext();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const [parsedId, parsedInput] = [
    idSchema.safeParse(draftId),
    userStoryDraftInputSchema.safeParse(input),
  ];
  if (!parsedId.success || !parsedInput.success) {
    return {
      ok: false,
      message: "请检查 US 草稿内容",
      fieldErrors: parsedInput.success
        ? undefined
        : parsedInput.error.flatten().fieldErrors,
    };
  }

  const draft = await db.userStoryDraft.findFirst({
    where: {
      id: parsedId.data,
      projectId: project.id,
      deletedAt: null,
    },
    select: {
      id: true,
      status: true,
      acceptanceCriteria: {
        where: { deletedAt: null },
        select: { id: true },
      },
    },
  });
  if (!draft) {
    return { ok: false, message: "US 草稿不存在或已删除" };
  }
  if (draft.status !== AiDraftStatus.PENDING) {
    return { ok: false, message: "已确认的 US 草稿不能再修改" };
  }

  const inputCriterionIds = new Set(
    parsedInput.data.acceptanceCriteria.flatMap((criterion) =>
      criterion.id ? [criterion.id] : [],
    ),
  );
  const existingCriterionIds = new Set(
    draft.acceptanceCriteria.map((criterion) => criterion.id),
  );
  if (
    [...inputCriterionIds].some(
      (criterionId) => !existingCriterionIds.has(criterionId),
    )
  ) {
    return { ok: false, message: "验收标准中包含无效数据" };
  }

  const acceptanceCriteria = await db.$transaction(async (transaction) => {
    await transaction.userStoryDraft.update({
      where: { id: draft.id },
      data: {
        title: parsedInput.data.title,
        asA: parsedInput.data.asA,
        iWant: parsedInput.data.iWant,
        soThat: parsedInput.data.soThat,
        businessRules: parsedInput.data.businessRules || null,
        nonFunctionalRequirements:
          parsedInput.data.nonFunctionalRequirements || null,
      },
    });

    await transaction.draftAcceptanceCriterion.updateMany({
      where: {
        draftId: draft.id,
        deletedAt: null,
        id: { notIn: [...inputCriterionIds] },
      },
      data: { deletedAt: new Date() },
    });

    for (const [
      position,
      criterion,
    ] of parsedInput.data.acceptanceCriteria.entries()) {
      if (criterion.id) {
        await transaction.draftAcceptanceCriterion.update({
          where: { id: criterion.id },
          data: {
            position,
            given: criterion.given,
            when: criterion.when,
            then: criterion.then,
          },
        });
      } else {
        await transaction.draftAcceptanceCriterion.create({
          data: {
            draftId: draft.id,
            position,
            given: criterion.given,
            when: criterion.when,
            then: criterion.then,
          },
        });
      }
    }

    return transaction.draftAcceptanceCriterion.findMany({
      where: { draftId: draft.id, deletedAt: null },
      orderBy: { position: "asc" },
      select: {
        id: true,
        given: true,
        when: true,
        then: true,
      },
    });
  });

  revalidatePath(`/user-story-drafts/${draft.id}`);
  return {
    ok: true,
    message: "US 草稿已保存",
    data: { acceptanceCriteria },
  };
}

export async function confirmUserStoryDraftAction(
  draftId: string,
): Promise<ActionResult<{ id: string }>> {
  const { project } = await getCurrentActionContext();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsedId = idSchema.safeParse(draftId);
  if (!parsedId.success) {
    return { ok: false, message: "US 草稿无效" };
  }

  const draft = await db.userStoryDraft.findFirst({
    where: {
      id: parsedId.data,
      projectId: project.id,
      deletedAt: null,
    },
    include: {
      feature: { select: { id: true, deletedAt: true } },
      acceptanceCriteria: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!draft) {
    return { ok: false, message: "US 草稿不存在或已删除" };
  }
  if (draft.status !== AiDraftStatus.PENDING) {
    return { ok: false, message: "该 US 草稿已经确认" };
  }
  if (draft.featureId && (!draft.feature || draft.feature.deletedAt)) {
    return { ok: false, message: "所属 FE 不存在或已删除" };
  }
  if (draft.acceptanceCriteria.length === 0) {
    return { ok: false, message: "US 草稿至少需要一条验收标准" };
  }

  const code = await generateBusinessCode("US");
  let story: { id: string };
  try {
    story = await db.$transaction(async (transaction) => {
      const claimed = await transaction.userStoryDraft.updateMany({
        where: {
          id: draft.id,
          status: AiDraftStatus.PENDING,
          deletedAt: null,
          confirmedUserStoryId: null,
        },
        data: {
          status: AiDraftStatus.CONFIRMED,
          confirmedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        throw new DraftStateChangedError();
      }

      const createdStory = await transaction.userStory.create({
        data: {
          projectId: draft.projectId,
          featureId: draft.featureId,
          code,
          title: draft.title,
          asA: draft.asA,
          iWant: draft.iWant,
          soThat: draft.soThat,
          status: RequirementStatus.DESIGN,
          businessRules: draft.businessRules,
          nonFunctionalRequirements: draft.nonFunctionalRequirements,
          acceptanceCriteria: {
            create: draft.acceptanceCriteria.map((criterion, position) => ({
              position,
              given: criterion.given,
              when: criterion.when,
              then: criterion.then,
            })),
          },
        },
        select: { id: true },
      });

      await transaction.userStoryDraft.update({
        where: { id: draft.id },
        data: { confirmedUserStoryId: createdStory.id },
      });
      return createdStory;
    });
  } catch (error) {
    if (error instanceof DraftStateChangedError) {
      return { ok: false, message: "草稿状态已变化，请刷新后重试" };
    }
    throw error;
  }

  revalidatePath("/requirements");
  revalidatePath("/ai-executions");
  revalidatePath(`/user-story-drafts/${draft.id}`);
  if (draft.featureId) {
    revalidatePath(`/features/${draft.featureId}`);
  }
  return {
    ok: true,
    message: "US 已创建",
    data: story,
  };
}

export async function deleteUserStoryDraftAction(
  draftId: string,
): Promise<ActionResult> {
  const { project } = await getCurrentActionContext();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsedId = idSchema.safeParse(draftId);
  if (!parsedId.success) {
    return { ok: false, message: "US 草稿无效" };
  }

  const draft = await db.userStoryDraft.findFirst({
    where: {
      id: parsedId.data,
      projectId: project.id,
      deletedAt: null,
    },
    select: { id: true, status: true },
  });
  if (!draft) {
    return { ok: false, message: "US 草稿不存在或已删除" };
  }
  if (draft.status !== AiDraftStatus.PENDING) {
    return { ok: false, message: "已确认的 US 草稿不能删除" };
  }

  const deletedAt = new Date();
  await db.$transaction([
    db.draftAcceptanceCriterion.updateMany({
      where: { draftId: draft.id, deletedAt: null },
      data: { deletedAt },
    }),
    db.userStoryDraft.update({
      where: { id: draft.id },
      data: { deletedAt },
    }),
  ]);

  revalidatePath("/ai-executions");
  return { ok: true, message: "US 草稿已删除" };
}
