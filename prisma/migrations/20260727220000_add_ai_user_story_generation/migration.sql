-- CreateTable
CREATE TABLE "AiModelProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AiCapabilityBinding" (
    "capability" TEXT NOT NULL PRIMARY KEY,
    "modelProfileId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiCapabilityBinding_modelProfileId_fkey" FOREIGN KEY ("modelProfileId") REFERENCES "AiModelProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "featureId" TEXT,
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
    CONSTRAINT "AiExecution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AiExecution_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AiExecution_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserStoryDraft" (
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

-- CreateTable
CREATE TABLE "DraftAcceptanceCriterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "given" TEXT NOT NULL,
    "when" TEXT NOT NULL,
    "then" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "DraftAcceptanceCriterion_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "UserStoryDraft" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiWorkerLease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "AiModelProfile_deletedAt_name_idx" ON "AiModelProfile"("deletedAt", "name");

-- CreateIndex
CREATE INDEX "AiCapabilityBinding_modelProfileId_idx" ON "AiCapabilityBinding"("modelProfileId");

-- CreateIndex
CREATE INDEX "AiExecution_status_queuedAt_idx" ON "AiExecution"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "AiExecution_projectId_createdAt_idx" ON "AiExecution"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AiExecution_featureId_idx" ON "AiExecution"("featureId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStoryDraft_sourceExecutionId_key" ON "UserStoryDraft"("sourceExecutionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStoryDraft_confirmedUserStoryId_key" ON "UserStoryDraft"("confirmedUserStoryId");

-- CreateIndex
CREATE INDEX "UserStoryDraft_projectId_deletedAt_updatedAt_idx" ON "UserStoryDraft"("projectId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "UserStoryDraft_featureId_deletedAt_idx" ON "UserStoryDraft"("featureId", "deletedAt");

-- CreateIndex
CREATE INDEX "DraftAcceptanceCriterion_draftId_deletedAt_position_idx" ON "DraftAcceptanceCriterion"("draftId", "deletedAt", "position");

-- CreateIndex
CREATE INDEX "AiWorkerLease_expiresAt_idx" ON "AiWorkerLease"("expiresAt");
