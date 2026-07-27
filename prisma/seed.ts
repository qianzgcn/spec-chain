import "dotenv/config";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "../src/generated/prisma/client";
import { UserRole } from "../src/generated/prisma/enums";
import { hashPassword } from "../src/lib/security/password";

const databaseUrl = process.env.DATABASE_URL;
const adminUsername = process.env.ADMIN_USERNAME?.trim();
const adminPassword = process.env.ADMIN_PASSWORD;

if (!databaseUrl?.startsWith("file:")) {
  throw new Error("DATABASE_URL 必须是 SQLite file: 地址。");
}

if (!adminUsername) {
  throw new Error("ADMIN_USERNAME 不能为空。");
}

if (!adminPassword || adminPassword.length < 8) {
  throw new Error("ADMIN_PASSWORD 至少需要 8 位。");
}

const seedAdminUsername = adminUsername;
const seedAdminPassword = adminPassword;

const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
const db = new PrismaClient({ adapter });

async function main() {
  const existingUser = await db.user.findUnique({
    where: { username: seedAdminUsername },
    select: { id: true },
  });

  if (!existingUser) {
    await db.user.create({
      data: {
        username: seedAdminUsername,
        passwordHash: await hashPassword(seedAdminPassword),
        role: UserRole.ADMIN,
      },
    });
    console.log(`已创建初始管理员：${seedAdminUsername}`);
  } else {
    console.log(`初始化用户已存在：${seedAdminUsername}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error("初始化管理员失败：", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
