import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decryptAesGcm, encryptAesGcm } from "@/lib/security/aes-gcm";
import { hashPassword, verifyPassword } from "@/lib/security/password";

describe("敏感变量加密", () => {
  it("使用 AES-256-GCM 加密并可正确解密", () => {
    const key = randomBytes(32);
    const encrypted = encryptAesGcm("secret-value", key);

    expect(encrypted).not.toContain("secret-value");
    expect(decryptAesGcm(encrypted, key)).toBe("secret-value");
  });

  it("相同明文会使用不同随机 IV", () => {
    const key = randomBytes(32);
    expect(encryptAesGcm("same", key)).not.toBe(encryptAesGcm("same", key));
  });

  it("密文被篡改时拒绝解密", () => {
    const key = randomBytes(32);
    const encrypted = encryptAesGcm("secret-value", key);
    const parts = encrypted.split(":");
    const ciphertext = parts[3]!;
    parts[3] = `${ciphertext[0] === "A" ? "B" : "A"}${ciphertext.slice(1)}`;

    expect(() => decryptAesGcm(parts.join(":"), key)).toThrow();
  });
});

describe("密码哈希", () => {
  it("使用 Argon2id 验证正确密码并拒绝错误密码", async () => {
    const passwordHash = await hashPassword("admin12345");

    expect(passwordHash).toContain("$argon2id$");
    await expect(verifyPassword(passwordHash, "admin12345")).resolves.toBe(
      true,
    );
    await expect(verifyPassword(passwordHash, "wrong-password")).resolves.toBe(
      false,
    );
  });
});
