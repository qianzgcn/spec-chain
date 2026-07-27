"use server";

import { z } from "zod";

import { revalidatePath } from "next/cache";

import { RequirementStatus } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import {
  buildFeatureMarkdown,
  buildUserStoryMarkdown,
} from "@/lib/requirements/markdown";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";
import { generateBusinessCode } from "@/server/requirements/business-code";

const featureSchema = z.object({
  name: z.string().trim().min(1, "请输入 FE 名称").max(150),
  summary: z.string().trim().min(1, "请输入一句话描述").max(300),
  backgroundGoal: z.string().trim().min(1, "请输入业务背景与目标"),
});

const acceptanceCriterionSchema = z.object({
  id: z.string().optional(),
  given: z.string().trim().min(1, "Given 不能为空"),
  when: z.string().trim().min(1, "When 不能为空"),
  then: z.string().trim().min(1, "Then 不能为空"),
});

const userStorySchema = z.object({
  featureId: z.string().nullable().optional(),
  title: z.string().trim().min(1, "请输入 US 标题").max(150),
  asA: z.string().trim().min(1, "As 不能为空"),
  iWant: z.string().trim().min(1, "I want 不能为空"),
  soThat: z.string().trim().min(1, "so that 不能为空"),
  status: z.enum(RequirementStatus),
  businessRules: z.string().trim().optional().default(""),
  nonFunctionalRequirements: z.string().trim().optional().default(""),
  acceptanceCriteria: z
    .array(acceptanceCriterionSchema)
    .min(1, "至少需要一条验收标准"),
});

async function requireCurrentProjectForAction() {
  await requireUser();
  const project = await getCurrentProject();
  return project;
}

export async function createFeatureAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
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

  const feature = await db.feature.create({
    data: {
      projectId: project.id,
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
        ? `FE 及其 ${feature._count.userStories} 个子 US 已删除`
        : "FE 已删除",
  };
}

export async function createUserStoryAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsed = userStorySchema.safeParse(input);
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

  const story = await db.userStory.create({
    data: {
      projectId: project.id,
      featureId: parsed.data.featureId ?? null,
      code: await generateBusinessCode("US"),
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
): Promise<ActionResult> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsed = userStorySchema.omit({ featureId: true }).safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查 US 内容",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const story = await db.userStory.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: {
      id: true,
      featureId: true,
      acceptanceCriteria: {
        where: { deletedAt: null },
        select: { id: true },
      },
    },
  });
  if (!story) {
    return { ok: false, message: "US 不存在或已删除" };
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

  await db.$transaction(async (transaction) => {
    await transaction.userStory.update({
      where: { id },
      data: {
        title: parsed.data.title,
        asA: parsed.data.asA,
        iWant: parsed.data.iWant,
        soThat: parsed.data.soThat,
        status: parsed.data.status,
        businessRules: parsed.data.businessRules || null,
        nonFunctionalRequirements:
          parsed.data.nonFunctionalRequirements || null,
      },
    });

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
    select: { id: true, featureId: true },
  });
  if (!story) {
    return { ok: false, message: "US 不存在或已删除" };
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
