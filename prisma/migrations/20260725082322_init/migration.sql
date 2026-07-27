-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "gitUrl" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Repository_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectVariable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'PLAIN',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "ProjectVariable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Feature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "backgroundGoal" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Feature_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserStory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "featureId" TEXT,
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
    CONSTRAINT "UserStory_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AcceptanceCriterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userStoryId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "given" TEXT NOT NULL,
    "when" TEXT NOT NULL,
    "then" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "AcceptanceCriterion_userStoryId_fkey" FOREIGN KEY ("userStoryId") REFERENCES "UserStory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestCaseGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "TestCaseGroup_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'P2',
    "preconditions" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "script" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "TestCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCase_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TestCaseGroup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCaseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "expectedResult" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "TestStep_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestCaseUserStory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCaseId" TEXT NOT NULL,
    "userStoryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    CONSTRAINT "TestCaseUserStory_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCaseUserStory_userStoryId_fkey" FOREIGN KEY ("userStoryId") REFERENCES "UserStory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCaseId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
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
    "scriptSnapshot" TEXT NOT NULL,
    "baseUrlSnapshot" TEXT NOT NULL,
    CONSTRAINT "TestRun_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RunnerLease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BusinessCodeSequence" (
    "prefix" TEXT NOT NULL PRIMARY KEY,
    "lastTimestamp" BIGINT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");

-- CreateIndex
CREATE INDEX "Project_updatedAt_idx" ON "Project"("updatedAt");

-- CreateIndex
CREATE INDEX "Repository_projectId_deletedAt_idx" ON "Repository"("projectId", "deletedAt");

-- CreateIndex
CREATE INDEX "ProjectVariable_projectId_deletedAt_idx" ON "ProjectVariable"("projectId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Feature_code_key" ON "Feature"("code");

-- CreateIndex
CREATE INDEX "Feature_projectId_deletedAt_updatedAt_idx" ON "Feature"("projectId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserStory_code_key" ON "UserStory"("code");

-- CreateIndex
CREATE INDEX "UserStory_projectId_deletedAt_updatedAt_idx" ON "UserStory"("projectId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "UserStory_featureId_deletedAt_idx" ON "UserStory"("featureId", "deletedAt");

-- CreateIndex
CREATE INDEX "AcceptanceCriterion_userStoryId_deletedAt_position_idx" ON "AcceptanceCriterion"("userStoryId", "deletedAt", "position");

-- CreateIndex
CREATE INDEX "TestCaseGroup_projectId_deletedAt_idx" ON "TestCaseGroup"("projectId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TestCase_code_key" ON "TestCase"("code");

-- CreateIndex
CREATE INDEX "TestCase_projectId_deletedAt_updatedAt_idx" ON "TestCase"("projectId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "TestCase_groupId_deletedAt_idx" ON "TestCase"("groupId", "deletedAt");

-- CreateIndex
CREATE INDEX "TestStep_testCaseId_deletedAt_position_idx" ON "TestStep"("testCaseId", "deletedAt", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TestCaseUserStory_testCaseId_userStoryId_key" ON "TestCaseUserStory"("testCaseId", "userStoryId");

-- CreateIndex
CREATE INDEX "TestCaseUserStory_testCaseId_deletedAt_idx" ON "TestCaseUserStory"("testCaseId", "deletedAt");

-- CreateIndex
CREATE INDEX "TestCaseUserStory_userStoryId_deletedAt_idx" ON "TestCaseUserStory"("userStoryId", "deletedAt");

-- CreateIndex
CREATE INDEX "TestRun_status_queuedAt_idx" ON "TestRun"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "TestRun_testCaseId_queuedAt_idx" ON "TestRun"("testCaseId", "queuedAt");

-- CreateIndex
CREATE INDEX "TestRun_artifactsExpireAt_artifactsPurgedAt_idx" ON "TestRun"("artifactsExpireAt", "artifactsPurgedAt");

-- CreateIndex
CREATE INDEX "RunnerLease_expiresAt_idx" ON "RunnerLease"("expiresAt");
