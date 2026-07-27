import { mkdir, open, rm } from "node:fs/promises";
import path from "node:path";

const dataDirectory = path.resolve(process.cwd(), "data");
const databasePath = path.resolve(dataDirectory, "e2e.db");
const buildDirectory = path.resolve(process.cwd(), ".next-e2e");
const projectDirectory = path.resolve(process.cwd());

if (!databasePath.startsWith(`${dataDirectory}${path.sep}`)) {
  throw new Error("E2E 数据库路径超出 data 目录，已拒绝清理。");
}

if (path.dirname(buildDirectory) !== projectDirectory) {
  throw new Error("E2E 构建目录超出项目目录，已拒绝清理。");
}

await rm(databasePath, { force: true });
await rm(`${databasePath}-shm`, { force: true });
await rm(`${databasePath}-wal`, { force: true });
await rm(buildDirectory, { recursive: true, force: true });
await mkdir(dataDirectory, { recursive: true });

// Prisma 7 的 migrate deploy 要求 SQLite 文件已经存在。
const databaseFile = await open(databasePath, "w");
await databaseFile.close();
