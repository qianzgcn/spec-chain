"use server";

import { revalidatePath } from "next/cache";

import { UserRole } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import { hashPassword } from "@/lib/security/password";
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
} from "@/lib/users/schema";
import { requireAdmin, revokeUserSessions } from "@/server/auth/session";
import { db } from "@/server/db";

export async function createUserAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = createUserSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查用户信息",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const duplicate = await db.user.findUnique({
    where: { username: parsed.data.username },
    select: { id: true },
  });

  if (duplicate) {
    return { ok: false, message: "该用户名已被使用" };
  }

  await db.user.create({
    data: {
      username: parsed.data.username,
      passwordHash: await hashPassword(parsed.data.password),
      role: parsed.data.role,
    },
  });

  revalidatePath("/users");
  return { ok: true, message: "用户已创建" };
}

export async function updateUserAction(input: unknown): Promise<ActionResult> {
  const currentUser = await requireAdmin();
  const parsed = updateUserSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查用户信息",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const target = await db.user.findFirst({
    where: { id: parsed.data.id, deletedAt: null },
    select: {
      id: true,
      username: true,
      role: true,
    },
  });

  if (!target) {
    return { ok: false, message: "用户不存在或已删除" };
  }

  if (target.username !== parsed.data.username) {
    const duplicate = await db.user.findUnique({
      where: { username: parsed.data.username },
      select: { id: true },
    });
    if (duplicate) {
      return { ok: false, message: "该用户名已被使用" };
    }
  }

  if (target.role === UserRole.ADMIN && parsed.data.role !== UserRole.ADMIN) {
    const adminCount = await db.user.count({
      where: { role: UserRole.ADMIN, deletedAt: null },
    });
    if (adminCount <= 1) {
      return { ok: false, message: "至少需要保留一名管理员" };
    }
  }

  await db.user.update({
    where: { id: target.id },
    data: {
      username: parsed.data.username,
      role: parsed.data.role,
    },
  });

  if (
    target.role !== parsed.data.role ||
    target.username !== parsed.data.username
  ) {
    await revokeUserSessions(target.id);
  }

  revalidatePath("/users");

  return {
    ok: true,
    message:
      target.id === currentUser.id
        ? "用户信息已更新，请重新登录"
        : "用户信息已更新",
  };
}

export async function resetUserPasswordAction(
  input: unknown,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = resetPasswordSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查密码",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const target = await db.user.findFirst({
    where: { id: parsed.data.id, deletedAt: null },
    select: { id: true },
  });

  if (!target) {
    return { ok: false, message: "用户不存在或已删除" };
  }

  await db.user.update({
    where: { id: target.id },
    data: { passwordHash: await hashPassword(parsed.data.password) },
  });
  await revokeUserSessions(target.id);

  return { ok: true, message: "新密码已生效，该用户需要重新登录" };
}

export async function deleteUserAction(id: string): Promise<ActionResult> {
  const currentUser = await requireAdmin();

  if (id === currentUser.id) {
    return { ok: false, message: "不能删除当前登录用户" };
  }

  const target = await db.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, role: true },
  });

  if (!target) {
    return { ok: false, message: "用户不存在或已删除" };
  }

  if (target.role === UserRole.ADMIN) {
    const adminCount = await db.user.count({
      where: { role: UserRole.ADMIN, deletedAt: null },
    });
    if (adminCount <= 1) {
      return { ok: false, message: "不能删除最后一名管理员" };
    }
  }

  await db.$transaction([
    db.session.deleteMany({ where: { userId: id } }),
    db.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    }),
  ]);

  revalidatePath("/users");
  return { ok: true, message: "用户已删除" };
}
