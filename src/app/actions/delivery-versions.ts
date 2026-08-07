"use server";

import { revalidatePath } from "next/cache";

import { DeliveryVersionStatus } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import { isDeliveryVersionContentLocked } from "@/lib/delivery-versions/rules";
import {
  deliveryVersionInputSchema,
  deliveryVersionStatusSchema,
} from "@/lib/delivery-versions/schema";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCurrentProject } from "@/server/projects/current-project";
import { generateBusinessCodeInTransaction } from "@/server/requirements/business-code";

async function getActionContext() {
  const [user, project] = await Promise.all([
    requireUser(),
    getCurrentProject(),
  ]);
  return { user, project };
}

function revalidateDeliveryVersionPaths(id?: string) {
  revalidatePath("/delivery-versions");
  revalidatePath("/requirements");
  if (id) revalidatePath(`/delivery-versions/${id}`);
}

function parseExpectedUpdatedAt(value: string) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

export async function createDeliveryVersionAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { user, project } = await getActionContext();
  if (!project) return { ok: false, message: "请先创建项目" };

  const parsed = deliveryVersionInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查交付版本信息",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const version = await db.$transaction(async (transaction) => {
    const created = await transaction.deliveryVersion.create({
      data: {
        projectId: project.id,
        createdById: user.id,
        code: await generateBusinessCodeInTransaction(transaction, "DV"),
        name: parsed.data.name,
        description: parsed.data.description || null,
      },
      select: { id: true },
    });
    if (parsed.data.setCurrent) {
      await transaction.project.update({
        where: { id: project.id },
        data: { currentDeliveryVersionId: created.id },
      });
    }
    return created;
  });

  revalidateDeliveryVersionPaths(version.id);
  return { ok: true, message: "交付版本已创建", data: version };
}

export async function updateDeliveryVersionAction(
  id: string,
  input: unknown,
  expectedUpdatedAt: string,
): Promise<ActionResult> {
  const { project } = await getActionContext();
  if (!project) return { ok: false, message: "请先创建项目" };

  const parsed = deliveryVersionInputSchema.safeParse(input);
  const expected = parseExpectedUpdatedAt(expectedUpdatedAt);
  if (!parsed.success || !expected) {
    return {
      ok: false,
      message: "请检查交付版本信息",
      fieldErrors: parsed.success
        ? undefined
        : parsed.error.flatten().fieldErrors,
    };
  }

  const version = await db.deliveryVersion.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: { status: true, lockedAt: true },
  });
  if (!version) return { ok: false, message: "交付版本不存在或已删除" };
  if (version.status === DeliveryVersionStatus.DELIVERED) {
    return { ok: false, message: "已交付版本不能修改" };
  }

  if (parsed.data.setCurrent && isDeliveryVersionContentLocked(version)) {
    return { ok: false, message: "已锁定版本不能设为当前版本" };
  }
  const updated = await db.$transaction(async (transaction) => {
    const claimed = await transaction.deliveryVersion.updateMany({
      where: {
        id,
        projectId: project.id,
        deletedAt: null,
        updatedAt: expected,
      },
      data: {
        name: parsed.data.name,
        description: parsed.data.description || null,
      },
    });
    if (claimed.count !== 1) return false;
    if (parsed.data.setCurrent) {
      await transaction.project.update({
        where: { id: project.id },
        data: { currentDeliveryVersionId: id },
      });
    }
    return true;
  });
  if (!updated) {
    return { ok: false, message: "交付版本已被修改，请刷新后重试" };
  }

  revalidateDeliveryVersionPaths(id);
  return { ok: true, message: "交付版本已保存" };
}

export async function setCurrentDeliveryVersionAction(
  id: string,
): Promise<ActionResult> {
  const { project } = await getActionContext();
  if (!project) return { ok: false, message: "请先创建项目" };

  const version = await db.deliveryVersion.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: { id: true, status: true, lockedAt: true },
  });
  if (!version) return { ok: false, message: "交付版本不存在或已删除" };
  if (isDeliveryVersionContentLocked(version)) {
    return { ok: false, message: "只有未锁定、未交付版本可以设为当前版本" };
  }

  await db.project.update({
    where: { id: project.id },
    data: { currentDeliveryVersionId: version.id },
  });
  revalidateDeliveryVersionPaths(id);
  return { ok: true, message: "当前版本已更新" };
}

export async function lockDeliveryVersionAction(
  id: string,
): Promise<ActionResult> {
  const { user, project } = await getActionContext();
  if (!project) return { ok: false, message: "请先创建项目" };

  const version = await db.deliveryVersion.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: { id: true, status: true, lockedAt: true },
  });
  if (!version) return { ok: false, message: "交付版本不存在或已删除" };
  if (version.status === DeliveryVersionStatus.DELIVERED) {
    return { ok: false, message: "该版本已经交付并永久锁定" };
  }
  if (version.lockedAt) return { ok: true, message: "交付版本已锁定" };

  await db.$transaction([
    db.deliveryVersion.update({
      where: { id },
      data: { lockedAt: new Date(), lockedById: user.id },
    }),
    db.project.updateMany({
      where: { id: project.id, currentDeliveryVersionId: id },
      data: { currentDeliveryVersionId: null },
    }),
  ]);
  revalidateDeliveryVersionPaths(id);
  return { ok: true, message: "交付版本已锁定" };
}

export async function unlockDeliveryVersionAction(
  id: string,
): Promise<ActionResult> {
  const { project } = await getActionContext();
  if (!project) return { ok: false, message: "请先创建项目" };

  const version = await db.deliveryVersion.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: { status: true },
  });
  if (!version) return { ok: false, message: "交付版本不存在或已删除" };
  if (version.status === DeliveryVersionStatus.DELIVERED) {
    return { ok: false, message: "已交付版本不能解除锁定" };
  }

  await db.deliveryVersion.update({
    where: { id },
    data: { lockedAt: null, lockedById: null },
  });
  revalidateDeliveryVersionPaths(id);
  return { ok: true, message: "交付版本已解除锁定" };
}

export async function updateDeliveryVersionStatusAction(
  id: string,
  status: DeliveryVersionStatus,
): Promise<ActionResult> {
  const { user, project } = await getActionContext();
  if (!project) return { ok: false, message: "请先创建项目" };

  const parsed = deliveryVersionStatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, message: "交付版本状态无效" };

  const version = await db.deliveryVersion.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: { status: true, lockedAt: true },
  });
  if (!version) return { ok: false, message: "交付版本不存在或已删除" };
  if (version.status === DeliveryVersionStatus.DELIVERED) {
    return { ok: false, message: "已交付版本不能变更状态" };
  }
  if (parsed.data === version.status)
    return { ok: true, message: "状态未变化" };

  const validTransition =
    (version.status === DeliveryVersionStatus.PENDING &&
      parsed.data === DeliveryVersionStatus.IN_PROGRESS) ||
    (version.status === DeliveryVersionStatus.IN_PROGRESS &&
      parsed.data === DeliveryVersionStatus.PENDING) ||
    (version.status === DeliveryVersionStatus.IN_PROGRESS &&
      parsed.data === DeliveryVersionStatus.DELIVERED);
  if (!validTransition) return { ok: false, message: "不支持该状态变更" };

  if (parsed.data === DeliveryVersionStatus.DELIVERED) {
    const now = new Date();
    await db.$transaction([
      db.deliveryVersion.update({
        where: { id },
        data: {
          status: parsed.data,
          lockedAt: version.lockedAt ?? now,
          lockedById: version.lockedAt ? undefined : user.id,
          deliveredAt: now,
          deliveredById: user.id,
        },
      }),
      db.project.updateMany({
        where: { id: project.id, currentDeliveryVersionId: id },
        data: { currentDeliveryVersionId: null },
      }),
    ]);
  } else {
    await db.deliveryVersion.update({
      where: { id },
      data: { status: parsed.data },
    });
  }

  revalidateDeliveryVersionPaths(id);
  return {
    ok: true,
    message:
      parsed.data === DeliveryVersionStatus.DELIVERED
        ? "交付版本已标记为已交付"
        : "状态已更新",
  };
}

export async function moveUserStoryToDeliveryVersionAction(
  userStoryId: string,
  targetVersionId: string,
): Promise<ActionResult> {
  const { project } = await getActionContext();
  if (!project) return { ok: false, message: "请先创建项目" };

  const [story, target] = await Promise.all([
    db.userStory.findFirst({
      where: { id: userStoryId, projectId: project.id, deletedAt: null },
      select: {
        deliveryVersionId: true,
        deliveryVersion: { select: { lockedAt: true, status: true } },
      },
    }),
    db.deliveryVersion.findFirst({
      where: {
        id: targetVersionId,
        projectId: project.id,
        deletedAt: null,
      },
      select: { id: true, lockedAt: true, status: true },
    }),
  ]);
  if (!story) return { ok: false, message: "US 不存在或已删除" };
  if (!target) return { ok: false, message: "目标交付版本不存在或已删除" };
  if (story.deliveryVersionId === target.id) {
    return { ok: true, message: "US 已在该交付版本中" };
  }
  if (
    isDeliveryVersionContentLocked(story.deliveryVersion) ||
    isDeliveryVersionContentLocked(target)
  ) {
    return { ok: false, message: "US 只能在未锁定、未交付版本之间移动" };
  }

  await db.userStory.update({
    where: { id: userStoryId },
    data: { deliveryVersionId: target.id },
  });
  revalidateDeliveryVersionPaths(story.deliveryVersionId);
  revalidateDeliveryVersionPaths(target.id);
  revalidatePath(`/user-stories/${userStoryId}`);
  return { ok: true, message: "US 已移动" };
}

export async function deleteDeliveryVersionAction(
  id: string,
): Promise<ActionResult> {
  const { project } = await getActionContext();
  if (!project) return { ok: false, message: "请先创建项目" };

  const version = await db.deliveryVersion.findFirst({
    where: { id, projectId: project.id, deletedAt: null },
    select: {
      status: true,
      currentForProject: { select: { id: true } },
      _count: {
        select: {
          userStories: true,
          implementationReviews: true,
          verificationBatches: true,
        },
      },
    },
  });
  if (!version) return { ok: false, message: "交付版本不存在或已删除" };
  if (version.status === DeliveryVersionStatus.DELIVERED) {
    return { ok: false, message: "已交付版本不能删除" };
  }
  if (version.currentForProject) {
    return { ok: false, message: "请先取消当前版本后再删除" };
  }
  if (
    version._count.userStories +
      version._count.implementationReviews +
      version._count.verificationBatches >
    0
  ) {
    return { ok: false, message: "包含需求或验证记录的版本不能删除" };
  }

  await db.deliveryVersion.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidateDeliveryVersionPaths();
  return { ok: true, message: "交付版本已删除" };
}
