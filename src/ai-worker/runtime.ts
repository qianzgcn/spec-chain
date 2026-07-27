import "dotenv/config";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { z } from "zod";

import { PrismaClient } from "@/generated/prisma/client";
import { decryptAesGcm } from "@/lib/security/aes-gcm";

const runtimeEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .startsWith("file:", "DATABASE_URL 必须使用 SQLite file: 地址"),
  APP_ENCRYPTION_KEY: z.string().min(1, "APP_ENCRYPTION_KEY 不能为空"),
});

const parsedEnv = runtimeEnvSchema.parse(process.env);
const encryptionKey = Buffer.from(parsedEnv.APP_ENCRYPTION_KEY, "base64");

if (encryptionKey.length !== 32) {
  throw new Error("APP_ENCRYPTION_KEY 必须是 32 字节随机密钥的 Base64 编码。");
}

const adapter = new PrismaBetterSqlite3({
  url: parsedEnv.DATABASE_URL,
});

export const aiWorkerDb = new PrismaClient({ adapter });

export function decryptAiWorkerSecret(payload: string) {
  return decryptAesGcm(payload, encryptionKey);
}
