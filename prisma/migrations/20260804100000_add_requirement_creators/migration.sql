ALTER TABLE "Feature"
ADD COLUMN "createdById" TEXT
REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserStory"
ADD COLUMN "createdById" TEXT
REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Feature_createdById_idx" ON "Feature"("createdById");
CREATE INDEX "UserStory_createdById_idx" ON "UserStory"("createdById");
