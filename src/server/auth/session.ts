import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { UserRole } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { env } from "@/server/env";

const SESSION_COOKIE_NAME = "specchain_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.SESSION_COOKIE_SECURE,
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await db.session.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function revokeUserSessions(userId: string) {
  await db.session.deleteMany({ where: { userId } });
}

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          username: true,
          role: true,
          deletedAt: true,
        },
      },
    },
  });

  if (
    !session ||
    session.expiresAt.getTime() <= Date.now() ||
    session.user.deletedAt
  ) {
    return null;
  }

  return {
    id: session.user.id,
    username: session.user.username,
    role: session.user.role,
  };
});

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireAdmin() {
  const user = await requireUser();

  if (user.role !== UserRole.ADMIN) {
    redirect("/requirements");
  }

  return user;
}
