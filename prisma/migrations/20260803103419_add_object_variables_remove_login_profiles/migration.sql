/*
  Warnings:

  - You are about to drop the `ProjectLoginProfile` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `loginProfileId` on the `TestCase` table. All the data in the column will be lost.
  - You are about to drop the column `loginProfileId` on the `TestCaseDraft` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "ProjectLoginProfile_passwordVariableId_idx";

-- DropIndex
DROP INDEX "ProjectLoginProfile_usernameVariableId_idx";

-- DropIndex
DROP INDEX "ProjectLoginProfile_projectId_deletedAt_name_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ProjectLoginProfile";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "ProjectVariableField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variableId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'PLAIN',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectVariableField_variableId_fkey" FOREIGN KEY ("variableId") REFERENCES "ProjectVariable" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userStoryId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'P2',
    "preconditions" TEXT,
    "steps" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "script" TEXT,
    "scriptSource" TEXT,
    "aiScriptFingerprint" TEXT,
    "scriptGeneratedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "TestCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCase_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TestCaseGroup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCase_userStoryId_fkey" FOREIGN KEY ("userStoryId") REFERENCES "UserStory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TestCase" ("aiScriptFingerprint", "code", "createdAt", "deletedAt", "enabled", "groupId", "id", "name", "preconditions", "priority", "projectId", "script", "scriptGeneratedAt", "scriptSource", "steps", "updatedAt", "userStoryId") SELECT "aiScriptFingerprint", "code", "createdAt", "deletedAt", "enabled", "groupId", "id", "name", "preconditions", "priority", "projectId", "script", "scriptGeneratedAt", "scriptSource", "steps", "updatedAt", "userStoryId" FROM "TestCase";
DROP TABLE "TestCase";
ALTER TABLE "new_TestCase" RENAME TO "TestCase";
CREATE UNIQUE INDEX "TestCase_code_key" ON "TestCase"("code");
CREATE INDEX "TestCase_projectId_deletedAt_updatedAt_idx" ON "TestCase"("projectId", "deletedAt", "updatedAt");
CREATE INDEX "TestCase_groupId_deletedAt_idx" ON "TestCase"("groupId", "deletedAt");
CREATE INDEX "TestCase_userStoryId_deletedAt_idx" ON "TestCase"("userStoryId", "deletedAt");
CREATE TABLE "new_TestCaseDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "groupId" TEXT,
    "confirmedTestCaseId" TEXT,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "preconditions" TEXT,
    "steps" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "TestCaseDraft_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TestCaseDraftBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCaseDraft_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TestCaseGroup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCaseDraft_confirmedTestCaseId_fkey" FOREIGN KEY ("confirmedTestCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TestCaseDraft" ("batchId", "confirmedAt", "confirmedTestCaseId", "createdAt", "deletedAt", "groupId", "id", "name", "position", "preconditions", "priority", "status", "steps", "updatedAt") SELECT "batchId", "confirmedAt", "confirmedTestCaseId", "createdAt", "deletedAt", "groupId", "id", "name", "position", "preconditions", "priority", "status", "steps", "updatedAt" FROM "TestCaseDraft";
DROP TABLE "TestCaseDraft";
ALTER TABLE "new_TestCaseDraft" RENAME TO "TestCaseDraft";
CREATE UNIQUE INDEX "TestCaseDraft_confirmedTestCaseId_key" ON "TestCaseDraft"("confirmedTestCaseId");
CREATE INDEX "TestCaseDraft_batchId_deletedAt_position_idx" ON "TestCaseDraft"("batchId", "deletedAt", "position");
CREATE INDEX "TestCaseDraft_groupId_deletedAt_idx" ON "TestCaseDraft"("groupId", "deletedAt");
CREATE INDEX "TestCaseDraft_status_deletedAt_idx" ON "TestCaseDraft"("status", "deletedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ProjectVariableField_variableId_name_key" ON "ProjectVariableField"("variableId", "name");

-- CreateIndex
CREATE INDEX "ProjectVariableField_variableId_position_idx" ON "ProjectVariableField"("variableId", "position");
