"use server";

import { z } from "zod";

import { redirect } from "next/navigation";

import type { ActionResult } from "@/lib/action-result";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { db } from "@/server/db";
import {
  createSession,
  deleteCurrentSession,
  requireUser,
  revokeUserSessions,
} from "@/server/auth/session";

const loginSchema = z.object({
  username: z.string().trim().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码"),
    newPassword: z.string().min(8, "新密码至少需要 8 位"),
    confirmPassword: z.string().min(1, "请再次输入新密码"),
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    path: ["confirmPassword"],
    message: "两次输入的新密码不一致",
  });

const dummyPasswordHashPromise = hashPassword(
  "specchain-invalid-password-placeholder",
);

export async function loginAction(
  input: unknown,
): Promise<ActionResult<never>> {
  const parsed = loginSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查登录信息",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await db.user.findUnique({
    where: { username: parsed.data.username },
    select: {
      id: true,
      passwordHash: true,
      deletedAt: true,
    },
  });

  const passwordHash = user?.passwordHash ?? (await dummyPasswordHashPromise);
  const passwordMatched = await verifyPassword(
    passwordHash,
    parsed.data.password,
  );

  if (!user || user.deletedAt || !passwordMatched) {
    return {
      ok: false,
      message: "用户名或密码错误",
    };
  }

  await createSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  await deleteCurrentSession();
  redirect("/login");
}

export async function changePasswordAction(
  input: unknown,
): Promise<ActionResult<never>> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: "请检查密码信息",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const databaseUser = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  if (
    !databaseUser ||
    !(await verifyPassword(
      databaseUser.passwordHash,
      parsed.data.currentPassword,
    ))
  ) {
    return {
      ok: false,
      message: "当前密码不正确",
    };
  }

  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return {
      ok: false,
      message: "新密码不能与当前密码相同",
    };
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });
  await revokeUserSessions(user.id);
  await deleteCurrentSession();
  redirect("/login?passwordChanged=1");
}
