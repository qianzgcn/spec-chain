-- AlterTable
ALTER TABLE "Project" ADD COLUMN "loginMethodSource" TEXT;

-- CreateTable
CREATE TABLE "ProjectLoginProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "usernameVariableId" TEXT NOT NULL,
    "passwordVariableId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "ProjectLoginProfile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectLoginProfile_usernameVariableId_fkey" FOREIGN KEY ("usernameVariableId") REFERENCES "ProjectVariable" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectLoginProfile_passwordVariableId_fkey" FOREIGN KEY ("passwordVariableId") REFERENCES "ProjectVariable" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "TestCase" ADD COLUMN "loginProfileId" TEXT REFERENCES "ProjectLoginProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TestCaseDraft" ADD COLUMN "loginProfileId" TEXT REFERENCES "ProjectLoginProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ProjectLoginProfile_projectId_deletedAt_name_idx" ON "ProjectLoginProfile"("projectId", "deletedAt", "name");
CREATE INDEX "ProjectLoginProfile_usernameVariableId_idx" ON "ProjectLoginProfile"("usernameVariableId");
CREATE INDEX "ProjectLoginProfile_passwordVariableId_idx" ON "ProjectLoginProfile"("passwordVariableId");
CREATE INDEX "TestCase_loginProfileId_deletedAt_idx" ON "TestCase"("loginProfileId", "deletedAt");
CREATE INDEX "TestCaseDraft_loginProfileId_deletedAt_idx" ON "TestCaseDraft"("loginProfileId", "deletedAt");
