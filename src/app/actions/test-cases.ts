"use server";

import { revalidatePath } from "next/cache";

import {
  AiExecutionStatus,
  RunStatus,
  TestCaseScriptSource,
} from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import {
  isDeliveryVersionContentLocked,
  type DeliveryVersionContentState,
} from "@/lib/delivery-versions/rules";
import {
  validateScriptVariableReferences,
  validateTestCaseVariableReferences,
  VariableReferenceError,
} from "@/lib/project-variables/references";
import {
  testCaseGroupNameSchema,
  testCaseSchema,
} from "@/lib/test-cases/schema";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";
import { getProjectVariableMetadata } from "@/server/projects/project-variables";
import { generateBusinessCode } from "@/server/requirements/business-code";

class RecordChangedError extends Error {}

type GroupAndStoryValidation =
  | { ok: false; message: string }
  | {
      ok: true;
      userStory: {
        id: string;
        deliveryVersion: DeliveryVersionContentState;
      } | null;
    };

async function requireCurrentProjectForAction() {
  await requireUser();
  return getCurrentProject();
}

async function validateGroupAndStory(
  projectId: string,
  groupId: string,
  userStoryId: string | null,
  retainedUserStoryId: string | null = null,
): Promise<GroupAndStoryValidation> {
  const [group, userStory] = await Promise.all([
    db.testCaseGroup.findFirst({
      where: { id: groupId, projectId, deletedAt: null },
      select: { id: true },
    }),
    userStoryId
      ? db.userStory.findFirst({
          where: {
            id: userStoryId,
            projectId,
            ...(userStoryId === retainedUserStoryId ? {} : { deletedAt: null }),
          },
          select: {
            id: true,
            deliveryVersion: { select: { lockedAt: true, status: true } },
          },
        })
      : null,
  ]);

  if (!group) {
    return { ok: false, message: "用例分组不存在或已删除" };
  }
  if (userStoryId && !userStory) {
    return { ok: false, message: "关联 US 不存在或已删除" };
  }
  return { ok: true, userStory };
}

function isStoryLocked(
  userStory: {
    deliveryVersion: DeliveryVersionContentState;
  } | null,
) {
  return Boolean(
    userStory && isDeliveryVersionContentLocked(userStory.deliveryVersion),
  );
}

async function validateTestCaseVariables(
  projectId: string,
  input: { preconditions: string; steps: string; script: string },
): Promise<ActionResult | { ok: true }> {
  const variables = await getProjectVariableMetadata(projectId);
  try {
    validateTestCaseVariableReferences({
      preconditions: input.preconditions || null,
      steps: input.steps,
      variables,
    });
    if (input.script.trim()) {
      validateScriptVariableReferences({
        script: input.script,
        variables,
      });
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof VariableReferenceError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
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

  const validation = await validateGroupAndStory(
    project.id,
    parsed.data.groupId,
    parsed.data.userStoryId,
  );
  if (!validation.ok) return validation;
  if (isStoryLocked(validation.userStory)) {
    return { ok: false, message: "所属交付版本已锁定，不能新增需求用例" };
  }
  const variableValidation = await validateTestCaseVariables(
    project.id,
    parsed.data,
  );
  if (!variableValidation.ok) return variableValidation;
  const script = parsed.data.script.trim() || null;

  const code = await generateBusinessCode("TC");
  const testCase = await db.testCase.create({
    data: {
      projectId: project.id,
      groupId: parsed.data.groupId,
      code,
      name: parsed.data.name,
      priority: parsed.data.priority,
      preconditions: parsed.data.preconditions || null,
      steps: parsed.data.steps,
      enabled: parsed.data.enabled,
      script,
      scriptSource: script ? TestCaseScriptSource.MANUAL : null,
      userStoryId: parsed.data.userStoryId,
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
  expectedUpdatedAt: string,
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
  const expectedTimestamp = new Date(expectedUpdatedAt);
  if (Number.isNaN(expectedTimestamp.getTime())) {
    return { ok: false, message: "测试用例数据无效，请刷新后重试" };
  }

  const testCase = await db.testCase.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: {
      id: true,
      groupId: true,
      userStoryId: true,
      name: true,
      priority: true,
      preconditions: true,
      steps: true,
      enabled: true,
      script: true,
      scriptSource: true,
      updatedAt: true,
      userStory: {
        select: {
          deliveryVersion: { select: { lockedAt: true, status: true } },
        },
      },
    },
  });

  if (!testCase) {
    return { ok: false, message: "测试用例不存在或已删除" };
  }
  if (testCase.updatedAt.getTime() !== expectedTimestamp.getTime()) {
    return { ok: false, message: "测试用例内容已被更新，请刷新后重试" };
  }
  const validation = await validateGroupAndStory(
    project.id,
    parsed.data.groupId,
    parsed.data.userStoryId,
    testCase.userStoryId,
  );
  if (!validation.ok) return validation;
  const variableValidation = await validateTestCaseVariables(
    project.id,
    parsed.data,
  );
  if (!variableValidation.ok) return variableValidation;
  const script = parsed.data.script.trim() || null;
  const scriptChanged = script !== testCase.script;
  const nextPreconditions = parsed.data.preconditions || null;
  const contentChanged =
    testCase.groupId !== parsed.data.groupId ||
    testCase.userStoryId !== parsed.data.userStoryId ||
    testCase.name !== parsed.data.name ||
    testCase.priority !== parsed.data.priority ||
    testCase.preconditions !== nextPreconditions ||
    testCase.steps !== parsed.data.steps ||
    testCase.enabled !== parsed.data.enabled;
  if (
    contentChanged &&
    (isStoryLocked(testCase.userStory) || isStoryLocked(validation.userStory))
  ) {
    return { ok: false, message: "所属交付版本已锁定，不能修改需求用例" };
  }
  const automationContentChanged =
    testCase.name !== parsed.data.name ||
    testCase.preconditions !== nextPreconditions ||
    testCase.steps !== parsed.data.steps;
  const clearUnchangedManualScript =
    automationContentChanged &&
    testCase.scriptSource === TestCaseScriptSource.MANUAL &&
    !scriptChanged;
  const nextScript = clearUnchangedManualScript ? null : script;

  try {
    await db.$transaction(async (transaction) => {
      const updated = await transaction.testCase.updateMany({
        where: {
          id,
          projectId: project.id,
          deletedAt: null,
          updatedAt: expectedTimestamp,
        },
        data: {
          groupId: parsed.data.groupId,
          userStoryId: parsed.data.userStoryId,
          name: parsed.data.name,
          priority: parsed.data.priority,
          preconditions: nextPreconditions,
          steps: parsed.data.steps,
          enabled: parsed.data.enabled,
          script: nextScript,
          ...(scriptChanged || clearUnchangedManualScript
            ? {
                scriptSource: nextScript ? TestCaseScriptSource.MANUAL : null,
                aiScriptFingerprint: null,
                scriptGeneratedAt: null,
              }
            : {}),
        },
      });
      if (updated.count !== 1) throw new RecordChangedError();
    });
  } catch (error) {
    if (error instanceof RecordChangedError) {
      return { ok: false, message: "测试用例内容已被更新，请刷新后重试" };
    }
    throw error;
  }

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
    select: {
      id: true,
      userStory: {
        select: {
          deliveryVersion: { select: { lockedAt: true, status: true } },
        },
      },
    },
  });
  if (!testCase) {
    return { ok: false, message: "测试用例不存在或已删除" };
  }
  if (isStoryLocked(testCase.userStory)) {
    return { ok: false, message: "所属交付版本已锁定，不能变更用例状态" };
  }

  await db.testCase.update({
    where: { id },
    data: { enabled },
  });
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
      userStory: {
        select: {
          deliveryVersion: { select: { lockedAt: true, status: true } },
        },
      },
      _count: {
        select: {
          runs: {
            where: {
              status: { in: [RunStatus.QUEUED, RunStatus.RUNNING] },
            },
          },
          aiExecutions: {
            where: {
              deletedAt: null,
              status: {
                in: [AiExecutionStatus.QUEUED, AiExecutionStatus.RUNNING],
              },
            },
          },
        },
      },
    },
  });
  if (!testCase) {
    return { ok: false, message: "测试用例不存在或已删除" };
  }
  if (isStoryLocked(testCase.userStory)) {
    return { ok: false, message: "所属交付版本已锁定，不能删除需求用例" };
  }
  if (testCase._count.runs + testCase._count.aiExecutions > 0) {
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
