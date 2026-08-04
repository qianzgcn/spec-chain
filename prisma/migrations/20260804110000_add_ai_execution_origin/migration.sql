ALTER TABLE "AiExecution"
ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'USER';

CREATE INDEX "AiExecution_origin_idx" ON "AiExecution"("origin");
