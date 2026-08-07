-- DropIndex
DROP INDEX "ConsistencyCheckItem_testCaseId_idx";

-- DropIndex
DROP INDEX "ConsistencyCheckItem_userStoryId_idx";

-- DropIndex
DROP INDEX "ConsistencyCheckItem_executionId_outcome_idx";

-- DropIndex
DROP INDEX "ConsistencyCheckItem_projectId_executionId_idx";

-- DropIndex
DROP INDEX "ConsistencyCheckItem_testCaseDraftId_key";

-- DropIndex
DROP INDEX "ConsistencyCheckItem_userStoryDraftId_key";

-- DropIndex
DROP INDEX "TestCaseVersion_testCaseId_version_key";

-- DropIndex
DROP INDEX "TestCaseVersion_sourceExecutionId_idx";

-- DropIndex
DROP INDEX "TestCaseVersion_createdById_idx";

-- DropIndex
DROP INDEX "UserStoryVersion_userStoryId_version_key";

-- DropIndex
DROP INDEX "UserStoryVersion_sourceExecutionId_idx";

-- DropIndex
DROP INDEX "UserStoryVersion_createdById_idx";

-- DropIndex
DROP INDEX "UserStoryVersionAcceptanceCriterion_versionId_position_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ConsistencyCheckItem";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TestCaseVersion";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "UserStoryVersion";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "UserStoryVersionAcceptanceCriterion";
PRAGMA foreign_keys=on;

-- 旧一致性检查会生成反向更新草稿；新流程不再保留这类任务和结果。
DELETE FROM "DraftAcceptanceCriterion"
WHERE "draftId" IN (
    SELECT "id" FROM "UserStoryDraft"
    WHERE "sourceExecutionId" IN (
        SELECT "id" FROM "AiExecution" WHERE "capability" = 'CHECK_CONSISTENCY'
    )
);
DELETE FROM "UserStoryDraft"
WHERE "sourceExecutionId" IN (
    SELECT "id" FROM "AiExecution" WHERE "capability" = 'CHECK_CONSISTENCY'
);
DELETE FROM "TestCaseDraft"
WHERE "batchId" IN (
    SELECT "id" FROM "TestCaseDraftBatch"
    WHERE "sourceExecutionId" IN (
        SELECT "id" FROM "AiExecution" WHERE "capability" = 'CHECK_CONSISTENCY'
    )
);
DELETE FROM "TestCaseDraftBatch"
WHERE "sourceExecutionId" IN (
    SELECT "id" FROM "AiExecution" WHERE "capability" = 'CHECK_CONSISTENCY'
);
UPDATE "TestCase"
SET "retirementExecutionId" = NULL, "retiredById" = NULL
WHERE "retirementExecutionId" IN (
    SELECT "id" FROM "AiExecution" WHERE "capability" = 'CHECK_CONSISTENCY'
);
DELETE FROM "AiExecutionLog"
WHERE "executionId" IN (
    SELECT "id" FROM "AiExecution" WHERE "capability" = 'CHECK_CONSISTENCY'
);
DELETE FROM "AiExecution" WHERE "capability" = 'CHECK_CONSISTENCY';
UPDATE "AiCapabilityBinding"
SET "capability" = 'REVIEW_REQUIREMENT_IMPLEMENTATION'
WHERE "capability" = 'CHECK_CONSISTENCY';

-- CreateTable
CREATE TABLE "DeliveryVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "lockedById" TEXT,
    "deliveredById" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lockedAt" DATETIME,
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "DeliveryVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryVersion_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryVersion_deliveredById_fkey" FOREIGN KEY ("deliveredById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 每个现有项目建立一个可继续编辑的当前交付版本。
INSERT INTO "DeliveryVersion" (
    "id", "projectId", "createdById", "code", "name", "status",
    "createdAt", "updatedAt"
)
SELECT
    'delivery-' || "Project"."id",
    "Project"."id",
    (
        SELECT "User"."id"
        FROM "User"
        ORDER BY CASE WHEN "User"."deletedAt" IS NULL THEN 0 ELSE 1 END,
                 "User"."createdAt" ASC
        LIMIT 1
    ),
    'DV-MIGRATED-' || "Project"."id",
    '当前交付',
    'PENDING',
    STRFTIME('%Y-%m-%dT%H:%M:%f+00:00', 'now'),
    STRFTIME('%Y-%m-%dT%H:%M:%f+00:00', 'now')
FROM "Project";

-- CreateTable
CREATE TABLE "ImplementationReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "executionId" TEXT NOT NULL,
    "deliveryVersionId" TEXT NOT NULL,
    "specificationFingerprint" TEXT NOT NULL,
    "repositorySnapshot" TEXT NOT NULL,
    "conclusion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImplementationReview_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AiExecution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ImplementationReview_deliveryVersionId_fkey" FOREIGN KEY ("deliveryVersionId") REFERENCES "DeliveryVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImplementationReviewItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "userStoryId" TEXT NOT NULL,
    "userStoryCodeSnapshot" TEXT NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "specificationSnapshot" TEXT NOT NULL,
    "implementationStatus" TEXT NOT NULL,
    "coverageStatus" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImplementationReviewItem_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ImplementationReview" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ImplementationReviewItem_userStoryId_fkey" FOREIGN KEY ("userStoryId") REFERENCES "UserStory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImplementationReviewCriterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewItemId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "givenSnapshot" TEXT NOT NULL,
    "whenSnapshot" TEXT NOT NULL,
    "thenSnapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "ImplementationReviewCriterion_reviewItemId_fkey" FOREIGN KEY ("reviewItemId") REFERENCES "ImplementationReviewItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImplementationReviewFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewItemId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "evidence" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImplementationReviewFinding_reviewItemId_fkey" FOREIGN KEY ("reviewItemId") REFERENCES "ImplementationReviewItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryVerificationBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryVersionId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "specificationFingerprint" TEXT NOT NULL,
    "regressionFingerprint" TEXT NOT NULL,
    "repositorySnapshot" TEXT NOT NULL,
    "deploymentConfirmedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryVerificationBatch_deliveryVersionId_fkey" FOREIGN KEY ("deliveryVersionId") REFERENCES "DeliveryVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryVerificationBatch_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryVerificationItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "userStoryId" TEXT,
    "caseType" TEXT NOT NULL,
    "testCaseCodeSnapshot" TEXT NOT NULL,
    "testCaseNameSnapshot" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryVerificationItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DeliveryVerificationBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryVerificationItem_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryVerificationItem_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryVerificationItem_userStoryId_fkey" FOREIGN KEY ("userStoryId") REFERENCES "UserStory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
    "deliveryVersionId" TEXT,
    "capability" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'USER',
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
    CONSTRAINT "AiExecution_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AiExecution_deliveryVersionId_fkey" FOREIGN KEY ("deliveryVersionId") REFERENCES "DeliveryVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AiExecution" ("capability", "codeReferences", "completionTokens", "createdAt", "deletedAt", "durationMs", "errorMessage", "featureId", "finishedAt", "id", "modelIdSnapshot", "modelProfileNameSnapshot", "origin", "projectId", "promptTokens", "queuedAt", "repositorySnapshot", "requestedById", "requirementText", "skillNameSnapshot", "skillVersionSnapshot", "sourceUserStoryId", "stage", "startedAt", "status", "testCaseId", "totalTokens", "updatedAt", "workerId") SELECT "capability", "codeReferences", "completionTokens", "createdAt", "deletedAt", "durationMs", "errorMessage", "featureId", "finishedAt", "id", "modelIdSnapshot", "modelProfileNameSnapshot", "origin", "projectId", "promptTokens", "queuedAt", "repositorySnapshot", "requestedById", "requirementText", "skillNameSnapshot", "skillVersionSnapshot", "sourceUserStoryId", "stage", "startedAt", "status", "testCaseId", "totalTokens", "updatedAt", "workerId" FROM "AiExecution";
DROP TABLE "AiExecution";
ALTER TABLE "new_AiExecution" RENAME TO "AiExecution";
CREATE INDEX "AiExecution_status_queuedAt_idx" ON "AiExecution"("status", "queuedAt");
CREATE INDEX "AiExecution_projectId_deletedAt_queuedAt_idx" ON "AiExecution"("projectId", "deletedAt", "queuedAt");
CREATE INDEX "AiExecution_featureId_idx" ON "AiExecution"("featureId");
CREATE INDEX "AiExecution_sourceUserStoryId_idx" ON "AiExecution"("sourceUserStoryId");
CREATE INDEX "AiExecution_testCaseId_idx" ON "AiExecution"("testCaseId");
CREATE INDEX "AiExecution_deliveryVersionId_idx" ON "AiExecution"("deliveryVersionId");
CREATE INDEX "AiExecution_origin_idx" ON "AiExecution"("origin");
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseUrl" TEXT,
    "githubPatEncrypted" TEXT,
    "githubPatAccount" TEXT,
    "giteePatEncrypted" TEXT,
    "giteePatAccount" TEXT,
    "automationInstructions" TEXT,
    "loginMethodSource" TEXT,
    "currentDeliveryVersionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Project_currentDeliveryVersionId_fkey" FOREIGN KEY ("currentDeliveryVersionId") REFERENCES "DeliveryVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("automationInstructions", "baseUrl", "createdAt", "currentDeliveryVersionId", "deletedAt", "description", "giteePatAccount", "giteePatEncrypted", "githubPatAccount", "githubPatEncrypted", "id", "loginMethodSource", "name", "updatedAt") SELECT "automationInstructions", "baseUrl", "createdAt", 'delivery-' || "id", "deletedAt", "description", "giteePatAccount", "giteePatEncrypted", "githubPatAccount", "githubPatEncrypted", "id", "loginMethodSource", "name", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_currentDeliveryVersionId_key" ON "Project"("currentDeliveryVersionId");
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");
CREATE INDEX "Project_updatedAt_idx" ON "Project"("updatedAt");
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
    "proposedUserStoryId" TEXT,
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
    CONSTRAINT "TestCaseDraft_proposedUserStoryId_fkey" FOREIGN KEY ("proposedUserStoryId") REFERENCES "UserStory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCaseDraft_confirmedTestCaseId_fkey" FOREIGN KEY ("confirmedTestCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TestCaseDraft" ("batchId", "confirmedAt", "confirmedTestCaseId", "createdAt", "deletedAt", "groupId", "id", "name", "position", "preconditions", "priority", "proposedUserStoryId", "status", "steps", "updatedAt") SELECT "batchId", "confirmedAt", "confirmedTestCaseId", "createdAt", "deletedAt", "groupId", "id", "name", "position", "preconditions", "priority", "proposedUserStoryId", "status", "steps", "updatedAt" FROM "TestCaseDraft";
DROP TABLE "TestCaseDraft";
ALTER TABLE "new_TestCaseDraft" RENAME TO "TestCaseDraft";
CREATE INDEX "TestCaseDraft_batchId_deletedAt_position_idx" ON "TestCaseDraft"("batchId", "deletedAt", "position");
CREATE INDEX "TestCaseDraft_groupId_deletedAt_idx" ON "TestCaseDraft"("groupId", "deletedAt");
CREATE INDEX "TestCaseDraft_proposedUserStoryId_deletedAt_idx" ON "TestCaseDraft"("proposedUserStoryId", "deletedAt");
CREATE INDEX "TestCaseDraft_status_deletedAt_idx" ON "TestCaseDraft"("status", "deletedAt");
CREATE INDEX "TestCaseDraft_confirmedTestCaseId_idx" ON "TestCaseDraft"("confirmedTestCaseId");
CREATE TABLE "new_UserStory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "deliveryVersionId" TEXT NOT NULL,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "UserStory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserStory_deliveryVersionId_fkey" FOREIGN KEY ("deliveryVersionId") REFERENCES "DeliveryVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserStory_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserStory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UserStory" ("asA", "businessRules", "code", "createdAt", "createdById", "deletedAt", "deliveryVersionId", "featureId", "iWant", "id", "nonFunctionalRequirements", "projectId", "soThat", "status", "title", "updatedAt") SELECT "asA", "businessRules", "code", "createdAt", "createdById", "deletedAt", 'delivery-' || "projectId", "featureId", "iWant", "id", "nonFunctionalRequirements", "projectId", "soThat", "status", "title", "updatedAt" FROM "UserStory";
DROP TABLE "UserStory";
ALTER TABLE "new_UserStory" RENAME TO "UserStory";
CREATE UNIQUE INDEX "UserStory_code_key" ON "UserStory"("code");
CREATE INDEX "UserStory_projectId_deletedAt_updatedAt_idx" ON "UserStory"("projectId", "deletedAt", "updatedAt");
CREATE INDEX "UserStory_createdById_idx" ON "UserStory"("createdById");
CREATE INDEX "UserStory_featureId_deletedAt_idx" ON "UserStory"("featureId", "deletedAt");
CREATE INDEX "UserStory_deliveryVersionId_deletedAt_idx" ON "UserStory"("deliveryVersionId", "deletedAt");
CREATE TABLE "new_UserStoryDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "featureId" TEXT,
    "sourceExecutionId" TEXT NOT NULL,
    "confirmedUserStoryId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
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
    CONSTRAINT "UserStoryDraft_confirmedUserStoryId_fkey" FOREIGN KEY ("confirmedUserStoryId") REFERENCES "UserStory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UserStoryDraft" ("asA", "businessRules", "confirmedAt", "confirmedUserStoryId", "createdAt", "deletedAt", "featureId", "iWant", "id", "nonFunctionalRequirements", "projectId", "soThat", "sourceExecutionId", "status", "title", "updatedAt") SELECT "asA", "businessRules", "confirmedAt", "confirmedUserStoryId", "createdAt", "deletedAt", "featureId", "iWant", "id", "nonFunctionalRequirements", "projectId", "soThat", "sourceExecutionId", "status", "title", "updatedAt" FROM "UserStoryDraft";
DROP TABLE "UserStoryDraft";
ALTER TABLE "new_UserStoryDraft" RENAME TO "UserStoryDraft";
CREATE INDEX "UserStoryDraft_projectId_deletedAt_updatedAt_idx" ON "UserStoryDraft"("projectId", "deletedAt", "updatedAt");
CREATE INDEX "UserStoryDraft_featureId_deletedAt_idx" ON "UserStoryDraft"("featureId", "deletedAt");
CREATE INDEX "UserStoryDraft_sourceExecutionId_idx" ON "UserStoryDraft"("sourceExecutionId");
CREATE INDEX "UserStoryDraft_confirmedUserStoryId_idx" ON "UserStoryDraft"("confirmedUserStoryId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryVersion_code_key" ON "DeliveryVersion"("code");

-- CreateIndex
CREATE INDEX "DeliveryVersion_projectId_deletedAt_createdAt_idx" ON "DeliveryVersion"("projectId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryVersion_projectId_status_deletedAt_idx" ON "DeliveryVersion"("projectId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "DeliveryVersion_createdById_idx" ON "DeliveryVersion"("createdById");

-- CreateIndex
CREATE INDEX "DeliveryVersion_lockedById_idx" ON "DeliveryVersion"("lockedById");

-- CreateIndex
CREATE INDEX "DeliveryVersion_deliveredById_idx" ON "DeliveryVersion"("deliveredById");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationReview_executionId_key" ON "ImplementationReview"("executionId");

-- CreateIndex
CREATE INDEX "ImplementationReview_deliveryVersionId_createdAt_idx" ON "ImplementationReview"("deliveryVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "ImplementationReview_deliveryVersionId_conclusion_idx" ON "ImplementationReview"("deliveryVersionId", "conclusion");

-- CreateIndex
CREATE INDEX "ImplementationReviewItem_userStoryId_createdAt_idx" ON "ImplementationReviewItem"("userStoryId", "createdAt");

-- CreateIndex
CREATE INDEX "ImplementationReviewItem_reviewId_implementationStatus_idx" ON "ImplementationReviewItem"("reviewId", "implementationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationReviewItem_reviewId_userStoryId_key" ON "ImplementationReviewItem"("reviewId", "userStoryId");

-- CreateIndex
CREATE INDEX "ImplementationReviewCriterion_reviewItemId_status_idx" ON "ImplementationReviewCriterion"("reviewItemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationReviewCriterion_reviewItemId_position_key" ON "ImplementationReviewCriterion"("reviewItemId", "position");

-- CreateIndex
CREATE INDEX "ImplementationReviewFinding_reviewItemId_severity_idx" ON "ImplementationReviewFinding"("reviewItemId", "severity");

-- CreateIndex
CREATE INDEX "ImplementationReviewFinding_reviewItemId_type_idx" ON "ImplementationReviewFinding"("reviewItemId", "type");

-- CreateIndex
CREATE INDEX "DeliveryVerificationBatch_deliveryVersionId_createdAt_idx" ON "DeliveryVerificationBatch"("deliveryVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryVerificationBatch_requestedById_idx" ON "DeliveryVerificationBatch"("requestedById");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryVerificationItem_testRunId_key" ON "DeliveryVerificationItem"("testRunId");

-- CreateIndex
CREATE INDEX "DeliveryVerificationItem_testCaseId_createdAt_idx" ON "DeliveryVerificationItem"("testCaseId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryVerificationItem_userStoryId_idx" ON "DeliveryVerificationItem"("userStoryId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryVerificationItem_batchId_testCaseId_key" ON "DeliveryVerificationItem"("batchId", "testCaseId");
