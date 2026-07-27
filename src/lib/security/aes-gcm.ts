import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function assertKey(key: Buffer) {
  if (key.length !== 32) {
    throw new Error("AES-256-GCM 密钥必须是 32 字节。");
  }
}

export function encryptAesGcm(value: string, key: Buffer) {
  assertKey(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptAesGcm(payload: string, key: Buffer) {
  assertKey(key);
  const [version, ivText, authTagText, encryptedText] = payload.split(":");

  if (
    version !== VERSION ||
    !ivText ||
    !authTagText ||
    encryptedText === undefined
  ) {
    throw new Error("敏感变量密文格式无效。");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagText, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
