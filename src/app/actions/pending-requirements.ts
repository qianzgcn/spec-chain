"use server";

import { z } from "zod";

import { revalidatePath } from "next/cache";

import { AiDraftStatus, RequirementStatus } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import { userStoryDraftInputSchema } from "@/lib/requirements/user-story-schema";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";
import { generateBusinessCode } from "@/server/requirements/business-code";

const idSchema = z.string().min(1);

class DraftStateChangedError extends Error {}

async function requireCurrentProjectForAction() {
  await requireUser();
  return getCurrentProject();
}

export async function updatePendingRequirementAction(
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
  const project = await requireCurrentProjectForAction();
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
      message: "请检查待评审需求内容",
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
    return { ok: false, message: "待评审需求不存在或已删除" };
  }
  if (draft.status !== AiDraftStatus.PENDING) {
    return { ok: false, message: "该需求已经完成评审，不能再修改" };
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

  revalidatePath("/requirements/pending-review");
  revalidatePath(`/requirements/pending-review/${draft.id}`);
  return {
    ok: true,
    message: "待评审需求已保存",
    data: { acceptanceCriteria },
  };
}

export async function confirmPendingRequirementAction(
  draftId: string,
): Promise<ActionResult<{ id: string }>> {
  const project = await requireCurrentProjectForAction();
  const user = await requireUser();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsedId = idSchema.safeParse(draftId);
  if (!parsedId.success) {
    return { ok: false, message: "待评审需求无效" };
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
    return { ok: false, message: "待评审需求不存在或已删除" };
  }
  if (draft.status !== AiDraftStatus.PENDING) {
    return { ok: false, message: "该需求已经完成评审" };
  }
  if (draft.featureId && (!draft.feature || draft.feature.deletedAt)) {
    return { ok: false, message: "所属 FE 不存在或已删除" };
  }
  if (draft.acceptanceCriteria.length === 0) {
    return { ok: false, message: "待评审需求至少需要一条验收标准" };
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
          createdById: user.id,
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
      return { ok: false, message: "需求状态已变化，请刷新后重试" };
    }
    throw error;
  }

  revalidatePath("/requirements");
  revalidatePath("/requirements/pending-review");
  revalidatePath(`/requirements/pending-review/${draft.id}`);
  revalidatePath("/execution-tasks");
  revalidatePath(`/execution-tasks/${draft.sourceExecutionId}`);
  if (draft.featureId) {
    revalidatePath(`/features/${draft.featureId}`);
  }
  return {
    ok: true,
    message: "US 已创建",
    data: story,
  };
}

export async function deletePendingRequirementAction(
  draftId: string,
): Promise<ActionResult> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsedId = idSchema.safeParse(draftId);
  if (!parsedId.success) {
    return { ok: false, message: "待评审需求无效" };
  }

  const draft = await db.userStoryDraft.findFirst({
    where: {
      id: parsedId.data,
      projectId: project.id,
      deletedAt: null,
    },
    select: { id: true, status: true, sourceExecutionId: true },
  });
  if (!draft) {
    return { ok: false, message: "待评审需求不存在或已删除" };
  }
  if (draft.status !== AiDraftStatus.PENDING) {
    return { ok: false, message: "已确认的需求不能删除" };
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

  revalidatePath("/requirements/pending-review");
  revalidatePath(`/requirements/pending-review/${draft.id}`);
  revalidatePath("/execution-tasks");
  revalidatePath(`/execution-tasks/${draft.sourceExecutionId}`);
  return { ok: true, message: "待评审需求已删除" };
}
