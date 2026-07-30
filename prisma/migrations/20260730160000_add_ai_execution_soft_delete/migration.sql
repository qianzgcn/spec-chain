ALTER TABLE "AiExecution"
ADD COLUMN "deletedAt" DATETIME;

DROP INDEX "AiExecution_projectId_createdAt_idx";

CREATE INDEX "AiExecution_projectId_deletedAt_queuedAt_idx"
ON "AiExecution"("projectId", "deletedAt", "queuedAt");
