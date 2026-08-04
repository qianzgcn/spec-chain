-- CreateTable
CREATE TABLE "UserStoryVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userStoryId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "asA" TEXT NOT NULL,
    "iWant" TEXT NOT NULL,
    "soThat" TEXT NOT NULL,
    "businessRules" TEXT,
    "nonFunctionalRequirements" TEXT,
    "source" TEXT NOT NULL,
    "createdById" TEXT,
    "sourceExecutionId" TEXT,
    "repositorySnapshot" TEXT,
    "changeSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserStoryVersion_userStoryId_fkey" FOREIGN KEY ("userStoryId") REFERENCES "UserStory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserStoryVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserStoryVersion_sourceExecutionId_fkey" FOREIGN KEY ("sourceExecutionId") REFERENCES "AiExecution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserStoryVersionAcceptanceCriterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "versionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "given" TEXT NOT NULL,
    "when" TEXT NOT NULL,
    "then" TEXT NOT NULL,
    CONSTRAINT "UserStoryVersionAcceptanceCriterion_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "UserStoryVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestCaseVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCaseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "groupIdSnapshot" TEXT NOT NULL,
    "groupNameSnapshot" TEXT NOT NULL,
    "userStoryIdSnapshot" TEXT,
    "userStoryCodeSnapshot" TEXT,
    "userStoryTitleSnapshot" TEXT,
    "name" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "preconditions" TEXT,
    "steps" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdById" TEXT,
    "sourceExecutionId" TEXT,
    "repositorySnapshot" TEXT,
    "changeSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TestCaseVersion_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCaseVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCaseVersion_sourceExecutionId_fkey" FOREIGN KEY ("sourceExecutionId") REFERENCES "AiExecution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsistencyCheckItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "userStoryId" TEXT,
    "testCaseId" TEXT,
    "userStoryDraftId" TEXT,
    "testCaseDraftId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsistencyCheckItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ConsistencyCheckItem_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AiExecution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ConsistencyCheckItem_userStoryId_fkey" FOREIGN KEY ("userStoryId") REFERENCES "UserStory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ConsistencyCheckItem_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ConsistencyCheckItem_userStoryDraftId_fkey" FOREIGN KEY ("userStoryDraftId") REFERENCES "UserStoryDraft" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ConsistencyCheckItem_testCaseDraftId_fkey" FOREIGN KEY ("testCaseDraftId") REFERENCES "TestCaseDraft" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "retiredAt" DATETIME,
    "retirementReason" TEXT,
    "retiredById" TEXT,
    "retirementExecutionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "TestCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCase_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TestCaseGroup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCase_userStoryId_fkey" FOREIGN KEY ("userStoryId") REFERENCES "UserStory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCase_retiredById_fkey" FOREIGN KEY ("retiredById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCase_retirementExecutionId_fkey" FOREIGN KEY ("retirementExecutionId") REFERENCES "AiExecution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TestCase" ("aiScriptFingerprint", "code", "createdAt", "deletedAt", "enabled", "groupId", "id", "name", "preconditions", "priority", "projectId", "script", "scriptGeneratedAt", "scriptSource", "steps", "updatedAt", "userStoryId") SELECT "aiScriptFingerprint", "code", "createdAt", "deletedAt", "enabled", "groupId", "id", "name", "preconditions", "priority", "projectId", "script", "scriptGeneratedAt", "scriptSource", "steps", "updatedAt", "userStoryId" FROM "TestCase";
DROP TABLE "TestCase";
ALTER TABLE "new_TestCase" RENAME TO "TestCase";
CREATE UNIQUE INDEX "TestCase_code_key" ON "TestCase"("code");
CREATE INDEX "TestCase_projectId_deletedAt_updatedAt_idx" ON "TestCase"("projectId", "deletedAt", "updatedAt");
CREATE INDEX "TestCase_groupId_deletedAt_idx" ON "TestCase"("groupId", "deletedAt");
CREATE INDEX "TestCase_userStoryId_deletedAt_idx" ON "TestCase"("userStoryId", "deletedAt");
CREATE INDEX "TestCase_retiredById_idx" ON "TestCase"("retiredById");
CREATE INDEX "TestCase_retirementExecutionId_idx" ON "TestCase"("retirementExecutionId");
CREATE TABLE "new_TestCaseDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "groupId" TEXT,
    "proposedUserStoryId" TEXT,
    "targetTestCaseId" TEXT,
    "confirmedTestCaseId" TEXT,
    "position" INTEGER NOT NULL,
    "operation" TEXT NOT NULL DEFAULT 'CREATE',
    "baseVersion" INTEGER,
    "changeReason" TEXT,
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
INSERT INTO "new_TestCaseDraft" ("batchId", "confirmedAt", "confirmedTestCaseId", "createdAt", "deletedAt", "groupId", "id", "name", "position", "preconditions", "priority", "status", "steps", "updatedAt") SELECT "batchId", "confirmedAt", "confirmedTestCaseId", "createdAt", "deletedAt", "groupId", "id", "name", "position", "preconditions", "priority", "status", "steps", "updatedAt" FROM "TestCaseDraft";
DROP TABLE "TestCaseDraft";
ALTER TABLE "new_TestCaseDraft" RENAME TO "TestCaseDraft";
CREATE INDEX "TestCaseDraft_batchId_deletedAt_position_idx" ON "TestCaseDraft"("batchId", "deletedAt", "position");
CREATE INDEX "TestCaseDraft_groupId_deletedAt_idx" ON "TestCaseDraft"("groupId", "deletedAt");
CREATE INDEX "TestCaseDraft_proposedUserStoryId_deletedAt_idx" ON "TestCaseDraft"("proposedUserStoryId", "deletedAt");
CREATE INDEX "TestCaseDraft_status_deletedAt_idx" ON "TestCaseDraft"("status", "deletedAt");
CREATE INDEX "TestCaseDraft_targetTestCaseId_status_deletedAt_idx" ON "TestCaseDraft"("targetTestCaseId", "status", "deletedAt");
CREATE INDEX "TestCaseDraft_confirmedTestCaseId_idx" ON "TestCaseDraft"("confirmedTestCaseId");
CREATE TABLE "new_UserStory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "featureId" TEXT,
    "createdById" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "asA" TEXT NOT NULL,
    "iWant" TEXT NOT NULL,
    "soThat" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DESIGN',
    "businessRules" TEXT,
    "nonFunctionalRequirements" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "UserStory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserStory_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserStory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UserStory" ("asA", "businessRules", "code", "createdAt", "createdById", "deletedAt", "featureId", "iWant", "id", "nonFunctionalRequirements", "projectId", "soThat", "status", "title", "updatedAt") SELECT "asA", "businessRules", "code", "createdAt", "createdById", "deletedAt", "featureId", "iWant", "id", "nonFunctionalRequirements", "projectId", "soThat", "status", "title", "updatedAt" FROM "UserStory";
DROP TABLE "UserStory";
ALTER TABLE "new_UserStory" RENAME TO "UserStory";
CREATE UNIQUE INDEX "UserStory_code_key" ON "UserStory"("code");
CREATE INDEX "UserStory_projectId_deletedAt_updatedAt_idx" ON "UserStory"("projectId", "deletedAt", "updatedAt");
CREATE INDEX "UserStory_createdById_idx" ON "UserStory"("createdById");
CREATE INDEX "UserStory_featureId_deletedAt_idx" ON "UserStory"("featureId", "deletedAt");
CREATE TABLE "new_UserStoryDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "featureId" TEXT,
    "sourceExecutionId" TEXT NOT NULL,
    "targetUserStoryId" TEXT,
    "confirmedUserStoryId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "operation" TEXT NOT NULL DEFAULT 'CREATE',
    "baseVersion" INTEGER,
    "changeReason" TEXT,
    "title" TEXT NOT NULL,
    "asA" TEXT NOT NULL,
    "iWant" TEXT NOT NULL,
    "soThat" TEXT NOT NULL,
    "businessRules" TEXT,
    "nonFunctionalRequirements" TEXT,
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "UserStoryDraft_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserStoryDraft_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserStoryDraft_sourceExecutionId_fkey" FOREIGN KEY ("sourceExecutionId") REFERENCES "AiExecution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserStoryDraft_confirmedUserStoryId_fkey" FOREIGN KEY ("confirmedUserStoryId") REFERENCES "UserStory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserStoryDraft_targetUserStoryId_fkey" FOREIGN KEY ("targetUserStoryId") REFERENCES "UserStory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UserStoryDraft" ("asA", "businessRules", "confirmedAt", "confirmedUserStoryId", "createdAt", "deletedAt", "featureId", "iWant", "id", "nonFunctionalRequirements", "projectId", "soThat", "sourceExecutionId", "status", "title", "updatedAt") SELECT "asA", "businessRules", "confirmedAt", "confirmedUserStoryId", "createdAt", "deletedAt", "featureId", "iWant", "id", "nonFunctionalRequirements", "projectId", "soThat", "sourceExecutionId", "status", "title", "updatedAt" FROM "UserStoryDraft";
DROP TABLE "UserStoryDraft";
ALTER TABLE "new_UserStoryDraft" RENAME TO "UserStoryDraft";
CREATE INDEX "UserStoryDraft_projectId_deletedAt_updatedAt_idx" ON "UserStoryDraft"("projectId", "deletedAt", "updatedAt");
CREATE INDEX "UserStoryDraft_featureId_deletedAt_idx" ON "UserStoryDraft"("featureId", "deletedAt");
CREATE INDEX "UserStoryDraft_sourceExecutionId_idx" ON "UserStoryDraft"("sourceExecutionId");
CREATE INDEX "UserStoryDraft_targetUserStoryId_status_deletedAt_idx" ON "UserStoryDraft"("targetUserStoryId", "status", "deletedAt");
CREATE INDEX "UserStoryDraft_confirmedUserStoryId_idx" ON "UserStoryDraft"("confirmedUserStoryId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- 将现有正式内容作为 v1 保存，后续所有正文修改都从该版本继续递增。
INSERT INTO "UserStoryVersion" (
    "id", "userStoryId", "version", "title", "asA", "iWant",
    "soThat", "businessRules", "nonFunctionalRequirements", "source",
    "createdById", "changeSummary", "createdAt"
)
SELECT
    'usv_' || us."id" || '_1', us."id", 1,
    us."title", us."asA", us."iWant", us."soThat",
    us."businessRules", us."nonFunctionalRequirements", 'MIGRATION',
    us."createdById", '迁移时建立的初始版本', us."createdAt"
FROM "UserStory" us;

INSERT INTO "UserStoryVersionAcceptanceCriterion" (
    "id", "versionId", "position", "given", "when", "then"
)
SELECT
    'usvac_' || ac."id" || '_1', 'usv_' || ac."userStoryId" || '_1',
    ac."position", ac."given", ac."when", ac."then"
FROM "AcceptanceCriterion" ac
WHERE ac."deletedAt" IS NULL;

INSERT INTO "TestCaseVersion" (
    "id", "testCaseId", "version", "groupIdSnapshot", "groupNameSnapshot",
    "userStoryIdSnapshot", "userStoryCodeSnapshot", "userStoryTitleSnapshot",
    "name", "priority", "preconditions", "steps", "source", "changeSummary",
    "createdAt"
)
SELECT
    'tcv_' || tc."id" || '_1', tc."id", 1, tc."groupId", g."name",
    tc."userStoryId", us."code", us."title", tc."name", tc."priority",
    tc."preconditions", tc."steps", 'MIGRATION', '迁移时建立的初始版本',
    tc."createdAt"
FROM "TestCase" tc
JOIN "TestCaseGroup" g ON g."id" = tc."groupId"
LEFT JOIN "UserStory" us ON us."id" = tc."userStoryId";

-- CreateIndex
CREATE INDEX "UserStoryVersion_createdById_idx" ON "UserStoryVersion"("createdById");

-- CreateIndex
CREATE INDEX "UserStoryVersion_sourceExecutionId_idx" ON "UserStoryVersion"("sourceExecutionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStoryVersion_userStoryId_version_key" ON "UserStoryVersion"("userStoryId", "version");

-- CreateIndex
CREATE INDEX "UserStoryVersionAcceptanceCriterion_versionId_position_idx" ON "UserStoryVersionAcceptanceCriterion"("versionId", "position");

-- CreateIndex
CREATE INDEX "TestCaseVersion_createdById_idx" ON "TestCaseVersion"("createdById");

-- CreateIndex
CREATE INDEX "TestCaseVersion_sourceExecutionId_idx" ON "TestCaseVersion"("sourceExecutionId");

-- CreateIndex
CREATE UNIQUE INDEX "TestCaseVersion_testCaseId_version_key" ON "TestCaseVersion"("testCaseId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ConsistencyCheckItem_userStoryDraftId_key" ON "ConsistencyCheckItem"("userStoryDraftId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsistencyCheckItem_testCaseDraftId_key" ON "ConsistencyCheckItem"("testCaseDraftId");

-- CreateIndex
CREATE INDEX "ConsistencyCheckItem_projectId_executionId_idx" ON "ConsistencyCheckItem"("projectId", "executionId");

-- CreateIndex
CREATE INDEX "ConsistencyCheckItem_executionId_outcome_idx" ON "ConsistencyCheckItem"("executionId", "outcome");

-- CreateIndex
CREATE INDEX "ConsistencyCheckItem_userStoryId_idx" ON "ConsistencyCheckItem"("userStoryId");

-- CreateIndex
CREATE INDEX "ConsistencyCheckItem_testCaseId_idx" ON "ConsistencyCheckItem"("testCaseId");
