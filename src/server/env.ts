import "server-only";

import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .startsWith("file:", "DATABASE_URL 必须使用 SQLite file: 地址"),
  APP_ENCRYPTION_KEY: z.string().min(1, "APP_ENCRYPTION_KEY 不能为空"),
  SESSION_COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("；");
  throw new Error(`环境变量配置无效：${details}`);
}

const encryptionKey = Buffer.from(parsedEnv.data.APP_ENCRYPTION_KEY, "base64");

if (encryptionKey.length !== 32) {
  throw new Error("APP_ENCRYPTION_KEY 必须是 32 字节随机密钥的 Base64 编码。");
}

export const env = {
  ...parsedEnv.data,
  SESSION_COOKIE_SECURE: parsedEnv.data.SESSION_COOKIE_SECURE === "true",
  ENCRYPTION_KEY: encryptionKey,
};
