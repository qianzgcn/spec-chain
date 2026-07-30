PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- 测试用例与 US 统一为一对多关系。旧多对多关联按产品约定不做猜测性迁移。
DROP TABLE "TestCaseUserStory";

ALTER TABLE "TestCase"
ADD COLUMN "userStoryId" TEXT
REFERENCES "UserStory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "TestCase_userStoryId_deletedAt_idx"
ON "TestCase"("userStoryId", "deletedAt");

ALTER TABLE "AiExecution"
ADD COLUMN "sourceUserStoryId" TEXT
REFERENCES "UserStory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "AiExecution_sourceUserStoryId_idx"
ON "AiExecution"("sourceUserStoryId");

CREATE TABLE "TestCaseDraftBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sourceExecutionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "TestCaseDraftBatch_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCaseDraftBatch_sourceExecutionId_fkey"
        FOREIGN KEY ("sourceExecutionId") REFERENCES "AiExecution" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "TestCaseDraft" (
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
    CONSTRAINT "TestCaseDraft_batchId_fkey"
        FOREIGN KEY ("batchId") REFERENCES "TestCaseDraftBatch" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCaseDraft_groupId_fkey"
        FOREIGN KEY ("groupId") REFERENCES "TestCaseGroup" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCaseDraft_confirmedTestCaseId_fkey"
        FOREIGN KEY ("confirmedTestCaseId") REFERENCES "TestCase" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TestCaseDraftBatch_sourceExecutionId_key"
ON "TestCaseDraftBatch"("sourceExecutionId");

CREATE INDEX "TestCaseDraftBatch_projectId_deletedAt_updatedAt_idx"
ON "TestCaseDraftBatch"("projectId", "deletedAt", "updatedAt");

CREATE UNIQUE INDEX "TestCaseDraft_confirmedTestCaseId_key"
ON "TestCaseDraft"("confirmedTestCaseId");

CREATE INDEX "TestCaseDraft_batchId_deletedAt_position_idx"
ON "TestCaseDraft"("batchId", "deletedAt", "position");

CREATE INDEX "TestCaseDraft_groupId_deletedAt_idx"
ON "TestCaseDraft"("groupId", "deletedAt");

CREATE INDEX "TestCaseDraft_status_deletedAt_idx"
ON "TestCaseDraft"("status", "deletedAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
