-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProjectVariable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'STRING',
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "ProjectVariable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProjectVariable" ("createdAt", "deletedAt", "description", "encrypted", "id", "kind", "name", "position", "projectId", "updatedAt", "value")
SELECT "createdAt", "deletedAt", "description", CASE WHEN "kind" = 'SECRET' THEN true ELSE false END, "id", CASE WHEN "kind" = 'OBJECT' THEN 'OBJECT' ELSE 'STRING' END, "name", "position", "projectId", "updatedAt", "value"
FROM "ProjectVariable";
DROP TABLE "ProjectVariable";
ALTER TABLE "new_ProjectVariable" RENAME TO "ProjectVariable";
CREATE INDEX "ProjectVariable_projectId_deletedAt_idx" ON "ProjectVariable"("projectId", "deletedAt");
CREATE TABLE "new_ProjectVariableField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variableId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'STRING',
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectVariableField_variableId_fkey" FOREIGN KEY ("variableId") REFERENCES "ProjectVariable" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProjectVariableField" ("createdAt", "description", "encrypted", "id", "kind", "name", "position", "updatedAt", "value", "variableId")
SELECT "createdAt", "description", CASE WHEN "kind" = 'SECRET' THEN true ELSE false END, "id", 'STRING', "name", "position", "updatedAt", "value", "variableId"
FROM "ProjectVariableField";
DROP TABLE "ProjectVariableField";
ALTER TABLE "new_ProjectVariableField" RENAME TO "ProjectVariableField";
CREATE INDEX "ProjectVariableField_variableId_position_idx" ON "ProjectVariableField"("variableId", "position");
CREATE UNIQUE INDEX "ProjectVariableField_variableId_name_key" ON "ProjectVariableField"("variableId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
