-- AlterTable
ALTER TABLE "AiExecution" ADD COLUMN "sourceFingerprint" TEXT;
ALTER TABLE "AiExecution" ADD COLUMN "testCaseSnapshotFingerprint" TEXT;

-- AlterTable
ALTER TABLE "UserStory" ADD COLUMN "testCasesNeedUpdate" BOOLEAN NOT NULL DEFAULT false;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TestCaseDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "groupId" TEXT,
    "proposedUserStoryId" TEXT,
    "confirmedTestCaseId" TEXT,
    "targetTestCaseId" TEXT,
    "changeType" TEXT NOT NULL DEFAULT 'CREATE',
    "baseTestCaseUpdatedAt" DATETIME,
    "changeReason" TEXT,
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
    CONSTRAINT "TestCaseDraft_proposedUserStoryId_fkey" FOREIGN KEY ("proposedUserStoryId") REFERENCES "UserStory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCaseDraft_confirmedTestCaseId_fkey" FOREIGN KEY ("confirmedTestCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCaseDraft_targetTestCaseId_fkey" FOREIGN KEY ("targetTestCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TestCaseDraft" (
    "batchId",
    "confirmedAt",
    "confirmedTestCaseId",
    "createdAt",
    "deletedAt",
    "groupId",
    "id",
    "name",
    "position",
    "preconditions",
    "priority",
    "proposedUserStoryId",
    "status",
    "steps",
    "updatedAt"
)
SELECT
    "batchId",
    "confirmedAt",
    "confirmedTestCaseId",
    "createdAt",
    "deletedAt",
    "groupId",
    "id",
    "name",
    "position",
    "preconditions",
    "priority",
    "proposedUserStoryId",
    "status",
    "steps",
    "updatedAt"
FROM "TestCaseDraft";
DROP TABLE "TestCaseDraft";
ALTER TABLE "new_TestCaseDraft" RENAME TO "TestCaseDraft";
CREATE INDEX "TestCaseDraft_batchId_deletedAt_position_idx" ON "TestCaseDraft"("batchId", "deletedAt", "position");
CREATE INDEX "TestCaseDraft_groupId_deletedAt_idx" ON "TestCaseDraft"("groupId", "deletedAt");
CREATE INDEX "TestCaseDraft_proposedUserStoryId_deletedAt_idx" ON "TestCaseDraft"("proposedUserStoryId", "deletedAt");
CREATE INDEX "TestCaseDraft_status_deletedAt_idx" ON "TestCaseDraft"("status", "deletedAt");
CREATE INDEX "TestCaseDraft_confirmedTestCaseId_idx" ON "TestCaseDraft"("confirmedTestCaseId");
CREATE INDEX "TestCaseDraft_targetTestCaseId_idx" ON "TestCaseDraft"("targetTestCaseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
