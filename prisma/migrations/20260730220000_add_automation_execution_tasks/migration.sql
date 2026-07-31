-- DropIndex
DROP INDEX "AiWorkerLease_expiresAt_idx";

-- DropIndex
DROP INDEX "RunnerLease_expiresAt_idx";

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "automationInstructions" TEXT;

-- AlterTable
ALTER TABLE "TestCase" ADD COLUMN "aiScriptFingerprint" TEXT;
ALTER TABLE "TestCase" ADD COLUMN "scriptGeneratedAt" DATETIME;
ALTER TABLE "TestCase" ADD COLUMN "scriptSource" TEXT;

-- 现有脚本均来自人工编辑，迁移后不会被自动生成流程覆盖。
UPDATE "TestCase"
SET "scriptSource" = 'MANUAL'
WHERE "script" IS NOT NULL AND TRIM("script") <> '';

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AiWorkerLease";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "RunnerLease";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "TaskSchedulerLease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AiExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "featureId" TEXT,
    "sourceUserStoryId" TEXT,
    "testCaseId" TEXT,
    "capability" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT NOT NULL DEFAULT 'QUEUED',
    "requirementText" TEXT NOT NULL,
    "modelProfileNameSnapshot" TEXT,
    "modelIdSnapshot" TEXT,
    "skillNameSnapshot" TEXT,
    "skillVersionSnapshot" TEXT,
    "repositorySnapshot" TEXT,
    "codeReferences" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "errorMessage" TEXT,
    "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "durationMs" INTEGER,
    "workerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "AiExecution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AiExecution_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AiExecution_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AiExecution_sourceUserStoryId_fkey" FOREIGN KEY ("sourceUserStoryId") REFERENCES "UserStory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AiExecution_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AiExecution" ("capability", "codeReferences", "completionTokens", "createdAt", "deletedAt", "durationMs", "errorMessage", "featureId", "finishedAt", "id", "modelIdSnapshot", "modelProfileNameSnapshot", "projectId", "promptTokens", "queuedAt", "repositorySnapshot", "requestedById", "requirementText", "skillNameSnapshot", "skillVersionSnapshot", "sourceUserStoryId", "stage", "startedAt", "status", "totalTokens", "updatedAt", "workerId") SELECT "capability", "codeReferences", "completionTokens", "createdAt", "deletedAt", "durationMs", "errorMessage", "featureId", "finishedAt", "id", "modelIdSnapshot", "modelProfileNameSnapshot", "projectId", "promptTokens", "queuedAt", "repositorySnapshot", "requestedById", "requirementText", "skillNameSnapshot", "skillVersionSnapshot", "sourceUserStoryId", "stage", "startedAt", "status", "totalTokens", "updatedAt", "workerId" FROM "AiExecution";
DROP TABLE "AiExecution";
ALTER TABLE "new_AiExecution" RENAME TO "AiExecution";
CREATE INDEX "AiExecution_status_queuedAt_idx" ON "AiExecution"("status", "queuedAt");
CREATE INDEX "AiExecution_projectId_deletedAt_queuedAt_idx" ON "AiExecution"("projectId", "deletedAt", "queuedAt");
CREATE INDEX "AiExecution_featureId_idx" ON "AiExecution"("featureId");
CREATE INDEX "AiExecution_sourceUserStoryId_idx" ON "AiExecution"("sourceUserStoryId");
CREATE INDEX "AiExecution_testCaseId_idx" ON "AiExecution"("testCaseId");
CREATE TABLE "new_TestRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCaseId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT NOT NULL DEFAULT 'QUEUED',
    "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "durationMs" INTEGER,
    "exitCode" INTEGER,
    "errorSummary" TEXT,
    "logContent" TEXT,
    "screenshotPath" TEXT,
    "artifactsExpireAt" DATETIME NOT NULL,
    "artifactsPurgedAt" DATETIME,
    "cancelRequestedAt" DATETIME,
    "workerId" TEXT,
    "testCaseCodeSnapshot" TEXT NOT NULL,
    "testCaseNameSnapshot" TEXT NOT NULL,
    "scriptSnapshot" TEXT,
    "baseUrlSnapshot" TEXT NOT NULL,
    "generatedScriptInRun" BOOLEAN NOT NULL DEFAULT false,
    "modelProfileNameSnapshot" TEXT,
    "modelIdSnapshot" TEXT,
    "skillNameSnapshot" TEXT,
    "skillVersionSnapshot" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "deletedAt" DATETIME,
    CONSTRAINT "TestRun_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TestRun" ("artifactsExpireAt", "artifactsPurgedAt", "baseUrlSnapshot", "cancelRequestedAt", "durationMs", "errorSummary", "exitCode", "finishedAt", "id", "logContent", "queuedAt", "requestedById", "screenshotPath", "scriptSnapshot", "startedAt", "status", "testCaseCodeSnapshot", "testCaseId", "testCaseNameSnapshot", "workerId") SELECT "artifactsExpireAt", "artifactsPurgedAt", "baseUrlSnapshot", "cancelRequestedAt", "durationMs", "errorSummary", "exitCode", "finishedAt", "id", "logContent", "queuedAt", "requestedById", "screenshotPath", "scriptSnapshot", "startedAt", "status", "testCaseCodeSnapshot", "testCaseId", "testCaseNameSnapshot", "workerId" FROM "TestRun";
DROP TABLE "TestRun";
ALTER TABLE "new_TestRun" RENAME TO "TestRun";
UPDATE "TestRun"
SET "stage" = CASE
    WHEN "status" = 'RUNNING' THEN 'RUNNING_TEST'
    WHEN "status" = 'QUEUED' THEN 'QUEUED'
    ELSE 'COMPLETED'
END;
CREATE INDEX "TestRun_status_deletedAt_queuedAt_idx" ON "TestRun"("status", "deletedAt", "queuedAt");
CREATE INDEX "TestRun_testCaseId_deletedAt_queuedAt_idx" ON "TestRun"("testCaseId", "deletedAt", "queuedAt");
CREATE INDEX "TestRun_artifactsExpireAt_artifactsPurgedAt_idx" ON "TestRun"("artifactsExpireAt", "artifactsPurgedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TaskSchedulerLease_expiresAt_idx" ON "TaskSchedulerLease"("expiresAt");
