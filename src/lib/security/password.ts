import { hash, verify } from "@node-rs/argon2";

const passwordOptions = {
  // @node-rs/argon2 在运行时将 Argon2id 定义为枚举值 2。
  algorithm: 2 as const,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export function hashPassword(password: string) {
  return hash(password, passwordOptions);
}

export function verifyPassword(passwordHash: string, password: string) {
  return verify(passwordHash, password, passwordOptions);
}
