-- CreateTable
CREATE TABLE "AiExecutionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "executionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "stage" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiExecutionLog_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AiExecution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AiExecutionLog_executionId_position_key" ON "AiExecutionLog"("executionId", "position");

-- CreateIndex
CREATE INDEX "AiExecutionLog_executionId_createdAt_idx" ON "AiExecutionLog"("executionId", "createdAt");
