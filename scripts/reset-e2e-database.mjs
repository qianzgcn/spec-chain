import { rm } from "node:fs/promises";
import path from "node:path";

const dataDirectory = path.resolve(process.cwd(), "data");
const databasePath = path.resolve(dataDirectory, "e2e.db");

if (!databasePath.startsWith(`${dataDirectory}${path.sep}`)) {
  throw new Error("E2E 数据库路径超出 data 目录，已拒绝清理。");
}

await rm(databasePath, { force: true });
await rm(`${databasePath}-shm`, { force: true });
await rm(`${databasePath}-wal`, { force: true });
