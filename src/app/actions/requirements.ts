"use server";

import { z } from "zod";

import { revalidatePath } from "next/cache";

import {
  DeliveryVersionStatus,
  RequirementStatus,
} from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import { isDeliveryVersionContentLocked } from "@/lib/delivery-versions/rules";
import { featureSchema } from "@/lib/requirements/feature-schema";
import {
  buildFeatureMarkdown,
  buildUserStoryMarkdown,
} from "@/lib/requirements/markdown";
import { userStoryInputSchema } from "@/lib/requirements/user-story-schema";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";
import { generateBusinessCode } from "@/server/requirements/business-code";

class RecordChangedError extends Error {}

async function requireCurrentProjectForAction() {
  await requireUser();
  const project = await getCurrentProject();
  return project;
}

export async function createFeatureAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const project = await requireCurrentProjectForAction();
  const user = await requireUser();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsed = featureSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查 FE 内容",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const feature = await db.feature.create({
    data: {
      projectId: project.id,
      createdById: user.id,
      code: await generateBusinessCode("FE"),
      ...parsed.data,
    },
    select: { id: true },
  });

  revalidatePath("/requirements");
  return { ok: true, message: "FE 已创建", data: feature };
}

export async function updateFeatureAction(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsed = featureSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查 FE 内容",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const feature = await db.feature.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: { id: true },
  });
  if (!feature) {
    return { ok: false, message: "FE 不存在或已删除" };
  }

  await db.feature.update({ where: { id }, data: parsed.data });
  revalidatePath("/requirements");
  revalidatePath(`/features/${id}`);
  return { ok: true, message: "FE 已保存" };
}

export async function deleteFeatureAction(id: string): Promise<ActionResult> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const feature = await db.feature.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: {
      id: true,
      _count: {
        select: { userStories: { where: { deletedAt: null } } },
      },
    },
  });

  if (!feature) {
    return { ok: false, message: "FE 不存在或已删除" };
  }

  const lockedStory = await db.userStory.findFirst({
    where: {
      featureId: id,
      deletedAt: null,
      OR: [
        { deliveryVersion: { lockedAt: { not: null } } },
        { deliveryVersion: { status: DeliveryVersionStatus.DELIVERED } },
      ],
    },
    select: { code: true },
  });
  if (lockedStory) {
    return {
      ok: false,
      message: `FE 包含已锁定版本中的 US ${lockedStory.code}，不能删除`,
    };
  }

  const deletedAt = new Date();
  await db.$transaction([
    db.userStory.updateMany({
      where: { featureId: id, deletedAt: null },
      data: { deletedAt },
    }),
    db.feature.update({ where: { id }, data: { deletedAt } }),
  ]);

  revalidatePath("/requirements");
  return {
    ok: true,
    message:
      feature._count.userStories > 0
        ? `FE 及其 ${feature._count.userStories} 个关联 US 已删除`
        : "FE 已删除",
  };
}

export async function createUserStoryAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const project = await requireCurrentProjectForAction();
  const user = await requireUser();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsed = userStoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查 US 内容",
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

  const currentVersion = await db.project.findUnique({
    where: { id: project.id },
    select: {
      currentDeliveryVersion: {
        select: { id: true, lockedAt: true, status: true, deletedAt: true },
      },
    },
  });
  if (
    !currentVersion?.currentDeliveryVersion ||
    currentVersion.currentDeliveryVersion.deletedAt ||
    isDeliveryVersionContentLocked(currentVersion.currentDeliveryVersion)
  ) {
    return { ok: false, message: "请先设置一个未锁定的当前交付版本" };
  }

  const code = await generateBusinessCode("US");
  const story = await db.userStory.create({
    data: {
      projectId: project.id,
      deliveryVersionId: currentVersion.currentDeliveryVersion.id,
      featureId: parsed.data.featureId ?? null,
      createdById: user.id,
      code,
      title: parsed.data.title,
      asA: parsed.data.asA,
      iWant: parsed.data.iWant,
      soThat: parsed.data.soThat,
      status: parsed.data.status,
      businessRules: parsed.data.businessRules || null,
      nonFunctionalRequirements: parsed.data.nonFunctionalRequirements || null,
      acceptanceCriteria: {
        create: parsed.data.acceptanceCriteria.map((criterion, position) => ({
          position,
          given: criterion.given,
          when: criterion.when,
          then: criterion.then,
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath("/requirements");
  return { ok: true, message: "US 已创建", data: story };
}

export async function updateUserStoryAction(
  id: string,
  input: unknown,
  expectedUpdatedAt: string,
): Promise<ActionResult> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsed = userStoryInputSchema
    .omit({ featureId: true })
    .safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查 US 内容",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const expectedTimestamp = new Date(expectedUpdatedAt);
  if (Number.isNaN(expectedTimestamp.getTime())) {
    return { ok: false, message: "US 数据无效，请刷新后重试" };
  }

  const story = await db.userStory.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: {
      id: true,
      title: true,
      asA: true,
      iWant: true,
      soThat: true,
      status: true,
      businessRules: true,
      nonFunctionalRequirements: true,
      updatedAt: true,
      featureId: true,
      deliveryVersion: { select: { lockedAt: true, status: true } },
      acceptanceCriteria: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: { id: true, given: true, when: true, then: true },
      },
    },
  });
  if (!story) {
    return { ok: false, message: "US 不存在或已删除" };
  }
  if (story.updatedAt.getTime() !== expectedTimestamp.getTime()) {
    return { ok: false, message: "US 内容已被更新，请刷新后重试" };
  }
  if (story.title !== parsed.data.title) {
    return { ok: false, message: "US 标题创建后不能修改" };
  }

  const inputIds = new Set(
    parsed.data.acceptanceCriteria.flatMap((criterion) =>
      criterion.id ? [criterion.id] : [],
    ),
  );
  const existingIds = new Set(
    story.acceptanceCriteria.map((criterion) => criterion.id),
  );
  if ([...inputIds].some((criterionId) => !existingIds.has(criterionId))) {
    return { ok: false, message: "验收标准中包含无效数据" };
  }

  const nextCriteria = parsed.data.acceptanceCriteria.map((criterion) => ({
    id: criterion.id ?? null,
    given: criterion.given,
    when: criterion.when,
    then: criterion.then,
  }));
  const currentCriteria = story.acceptanceCriteria.map((criterion) => ({
    id: criterion.id,
    given: criterion.given,
    when: criterion.when,
    then: criterion.then,
  }));
  const contentChanged =
    story.asA !== parsed.data.asA ||
    story.iWant !== parsed.data.iWant ||
    story.soThat !== parsed.data.soThat ||
    (story.businessRules ?? "") !== parsed.data.businessRules ||
    (story.nonFunctionalRequirements ?? "") !==
      parsed.data.nonFunctionalRequirements ||
    JSON.stringify(currentCriteria) !== JSON.stringify(nextCriteria);
  if (contentChanged && isDeliveryVersionContentLocked(story.deliveryVersion)) {
    return { ok: false, message: "所属交付版本已锁定，不能修改 US 内容" };
  }

  try {
    await db.$transaction(async (transaction) => {
      const claimed = await transaction.userStory.updateMany({
        where: {
          id,
          projectId: project.id,
          deletedAt: null,
          updatedAt: expectedTimestamp,
        },
        data: {
          asA: parsed.data.asA,
          iWant: parsed.data.iWant,
          soThat: parsed.data.soThat,
          status: parsed.data.status,
          businessRules: parsed.data.businessRules || null,
          nonFunctionalRequirements:
            parsed.data.nonFunctionalRequirements || null,
        },
      });
      if (claimed.count !== 1) throw new RecordChangedError();

      if (!contentChanged) return;

      await transaction.acceptanceCriterion.updateMany({
        where: {
          userStoryId: id,
          deletedAt: null,
          id: { notIn: [...inputIds] },
        },
        data: { deletedAt: new Date() },
      });

      for (const [
        position,
        criterion,
      ] of parsed.data.acceptanceCriteria.entries()) {
        if (criterion.id) {
          await transaction.acceptanceCriterion.update({
            where: { id: criterion.id },
            data: {
              position,
              given: criterion.given,
              when: criterion.when,
              then: criterion.then,
            },
          });
        } else {
          await transaction.acceptanceCriterion.create({
            data: {
              userStoryId: id,
              position,
              given: criterion.given,
              when: criterion.when,
              then: criterion.then,
            },
          });
        }
      }
    });
  } catch (error) {
    if (error instanceof RecordChangedError) {
      return { ok: false, message: "US 内容已被更新，请刷新后重试" };
    }
    throw error;
  }

  revalidatePath("/requirements");
  revalidatePath(`/user-stories/${id}`);
  if (story.featureId) {
    revalidatePath(`/features/${story.featureId}`);
  }
  return { ok: true, message: "US 已保存" };
}

export async function updateUserStoryStatusAction(
  id: string,
  status: RequirementStatus,
): Promise<ActionResult> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsedStatus = z.enum(RequirementStatus).safeParse(status);
  if (!parsedStatus.success) {
    return { ok: false, message: "需求状态无效" };
  }

  const story = await db.userStory.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: { id: true, featureId: true },
  });
  if (!story) {
    return { ok: false, message: "US 不存在或已删除" };
  }

  await db.userStory.update({
    where: { id },
    data: { status: parsedStatus.data },
  });

  revalidatePath("/requirements");
  revalidatePath(`/user-stories/${id}`);
  if (story.featureId) {
    revalidatePath(`/features/${story.featureId}`);
  }
  return { ok: true, message: "状态已更新" };
}

export async function deleteUserStoryAction(id: string): Promise<ActionResult> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const story = await db.userStory.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: {
      id: true,
      featureId: true,
      deliveryVersion: { select: { lockedAt: true, status: true } },
    },
  });
  if (!story) {
    return { ok: false, message: "US 不存在或已删除" };
  }
  if (isDeliveryVersionContentLocked(story.deliveryVersion)) {
    return { ok: false, message: "所属交付版本已锁定，不能删除 US" };
  }

  await db.userStory.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  revalidatePath("/requirements");
  if (story.featureId) {
    revalidatePath(`/features/${story.featureId}`);
  }
  return { ok: true, message: "US 已删除" };
}

export async function getRequirementMarkdownAction(
  type: "FEATURE" | "USER_STORY",
  id: string,
): Promise<ActionResult<{ markdown: string }>> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  if (type === "FEATURE") {
    const feature = await db.feature.findFirst({
      where: { id, projectId: project.id, deletedAt: null },
      include: {
        userStories: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          include: {
            acceptanceCriteria: {
              where: { deletedAt: null },
              orderBy: { position: "asc" },
            },
          },
        },
      },
    });
    if (!feature) {
      return { ok: false, message: "FE 不存在或已删除" };
    }
    return {
      ok: true,
      data: {
        markdown: buildFeatureMarkdown(feature),
      },
    };
  }

  const story = await db.userStory.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    include: {
      acceptanceCriteria: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!story) {
    return { ok: false, message: "US 不存在或已删除" };
  }

  return {
    ok: true,
    data: {
      markdown: buildUserStoryMarkdown(story),
    },
  };
}
