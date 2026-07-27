import "server-only";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/server/env";

const globalDatabase = globalThis as unknown as {
  specChainDatabase?: PrismaClient;
};

function createDatabaseClient() {
  const adapter = new PrismaBetterSqlite3({
    url: env.DATABASE_URL,
  });

  return new PrismaClient({ adapter });
}

export const db = globalDatabase.specChainDatabase ?? createDatabaseClient();

if (process.env.NODE_ENV !== "production") {
  globalDatabase.specChainDatabase = db;
}
