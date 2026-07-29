"use server";

import { revalidatePath } from "next/cache";

import { RunStatus } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import {
  testCaseGroupNameSchema,
  testCaseSchema,
} from "@/lib/test-cases/schema";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";
import { generateBusinessCode } from "@/server/requirements/business-code";

async function requireCurrentProjectForAction() {
  await requireUser();
  return getCurrentProject();
}

async function validateGroupAndStories(
  projectId: string,
  groupId: string,
  userStoryIds: string[],
): Promise<ActionResult | { ok: true }> {
  if (new Set(userStoryIds).size !== userStoryIds.length) {
    return { ok: false, message: "关联需求不能重复" };
  }

  const [group, storyCount] = await Promise.all([
    db.testCaseGroup.findFirst({
      where: { id: groupId, projectId, deletedAt: null },
      select: { id: true },
    }),
    db.userStory.count({
      where: {
        id: { in: userStoryIds },
        projectId,
        deletedAt: null,
      },
    }),
  ]);

  if (!group) {
    return { ok: false, message: "用例分组不存在或已删除" };
  }
  if (storyCount !== userStoryIds.length) {
    return { ok: false, message: "关联需求中包含无效或已删除的 US" };
  }
  return { ok: true };
}

export async function createTestCaseGroupAction(
  name: string,
): Promise<ActionResult<{ id: string }>> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsed = testCaseGroupNameSchema.safeParse(name);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "分组名称无效",
    };
  }

  const duplicate = await db.testCaseGroup.findFirst({
    where: {
      projectId: project.id,
      name: parsed.data,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (duplicate) {
    return { ok: false, message: "当前项目中已存在同名分组" };
  }

  const group = await db.testCaseGroup.create({
    data: { projectId: project.id, name: parsed.data },
    select: { id: true },
  });

  revalidatePath("/test-case-groups");
  revalidatePath("/test-cases");
  return { ok: true, message: "分组已创建", data: group };
}

export async function updateTestCaseGroupAction(
  id: string,
  name: string,
): Promise<ActionResult> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsed = testCaseGroupNameSchema.safeParse(name);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "分组名称无效",
    };
  }

  const [group, duplicate] = await Promise.all([
    db.testCaseGroup.findFirst({
      where: { id, projectId: project.id, deletedAt: null },
      select: { id: true },
    }),
    db.testCaseGroup.findFirst({
      where: {
        projectId: project.id,
        name: parsed.data,
        deletedAt: null,
        id: { not: id },
      },
      select: { id: true },
    }),
  ]);

  if (!group) {
    return { ok: false, message: "分组不存在或已删除" };
  }
  if (duplicate) {
    return { ok: false, message: "当前项目中已存在同名分组" };
  }

  await db.testCaseGroup.update({
    where: { id },
    data: { name: parsed.data },
  });

  revalidatePath("/test-case-groups");
  revalidatePath("/test-cases");
  return { ok: true, message: "分组已保存" };
}

export async function deleteTestCaseGroupAction(
  id: string,
): Promise<ActionResult> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const group = await db.testCaseGroup.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: {
      id: true,
      _count: {
        select: { testCases: { where: { deletedAt: null } } },
      },
    },
  });
  if (!group) {
    return { ok: false, message: "分组不存在或已删除" };
  }
  if (group._count.testCases > 0) {
    return {
      ok: false,
      message: `该分组仍有 ${group._count.testCases} 个用例，不能删除`,
    };
  }

  await db.testCaseGroup.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  revalidatePath("/test-case-groups");
  revalidatePath("/test-cases");
  return { ok: true, message: "分组已删除" };
}

export async function createTestCaseAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsed = testCaseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查测试用例内容",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const validation = await validateGroupAndStories(
    project.id,
    parsed.data.groupId,
    parsed.data.userStoryIds,
  );
  if (!validation.ok) return validation;

  const testCase = await db.testCase.create({
    data: {
      projectId: project.id,
      groupId: parsed.data.groupId,
      code: await generateBusinessCode("TC"),
      name: parsed.data.name,
      priority: parsed.data.priority,
      preconditions: parsed.data.preconditions || null,
      steps: parsed.data.steps,
      enabled: parsed.data.enabled,
      script: parsed.data.script.trim() || null,
      userStoryLinks: {
        create: parsed.data.userStoryIds.map((userStoryId) => ({
          userStoryId,
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath("/test-cases");
  revalidatePath("/test-case-groups");
  return { ok: true, message: "测试用例已创建", data: testCase };
}

export async function updateTestCaseAction(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const parsed = testCaseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查测试用例内容",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const [testCase, validation] = await Promise.all([
    db.testCase.findFirst({
      where: { id, projectId: project.id, deletedAt: null },
      select: { id: true },
    }),
    validateGroupAndStories(
      project.id,
      parsed.data.groupId,
      parsed.data.userStoryIds,
    ),
  ]);

  if (!testCase) {
    return { ok: false, message: "测试用例不存在或已删除" };
  }
  if (!validation.ok) return validation;

  await db.$transaction(async (transaction) => {
    await transaction.testCase.update({
      where: { id },
      data: {
        groupId: parsed.data.groupId,
        name: parsed.data.name,
        priority: parsed.data.priority,
        preconditions: parsed.data.preconditions || null,
        steps: parsed.data.steps,
        enabled: parsed.data.enabled,
        script: parsed.data.script.trim() || null,
      },
    });

    await transaction.testCaseUserStory.updateMany({
      where: {
        testCaseId: id,
        deletedAt: null,
        userStoryId: { notIn: parsed.data.userStoryIds },
        userStory: { deletedAt: null },
      },
      data: { deletedAt: new Date() },
    });

    for (const userStoryId of parsed.data.userStoryIds) {
      await transaction.testCaseUserStory.upsert({
        where: {
          testCaseId_userStoryId: {
            testCaseId: id,
            userStoryId,
          },
        },
        create: { testCaseId: id, userStoryId },
        update: { deletedAt: null },
      });
    }
  });

  revalidatePath("/test-cases");
  revalidatePath(`/test-cases/${id}`);
  revalidatePath("/test-case-groups");
  return { ok: true, message: "测试用例已保存" };
}

export async function setTestCaseEnabledAction(
  id: string,
  enabled: boolean,
): Promise<ActionResult> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const testCase = await db.testCase.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: { id: true },
  });
  if (!testCase) {
    return { ok: false, message: "测试用例不存在或已删除" };
  }

  await db.testCase.update({ where: { id }, data: { enabled } });
  revalidatePath("/test-cases");
  revalidatePath(`/test-cases/${id}`);
  return { ok: true, message: enabled ? "用例已启用" : "用例已停用" };
}

export async function deleteTestCaseAction(id: string): Promise<ActionResult> {
  const project = await requireCurrentProjectForAction();
  if (!project) {
    return { ok: false, message: "请先创建项目" };
  }

  const testCase = await db.testCase.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: {
      id: true,
      _count: {
        select: {
          runs: {
            where: {
              status: { in: [RunStatus.QUEUED, RunStatus.RUNNING] },
            },
          },
        },
      },
    },
  });
  if (!testCase) {
    return { ok: false, message: "测试用例不存在或已删除" };
  }
  if (testCase._count.runs > 0) {
    return { ok: false, message: "请先停止正在排队或运行的任务" };
  }

  await db.testCase.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  revalidatePath("/test-cases");
  revalidatePath("/test-case-groups");
  return { ok: true, message: "测试用例已删除" };
}
