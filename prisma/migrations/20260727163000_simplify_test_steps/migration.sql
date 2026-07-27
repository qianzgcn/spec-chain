-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_TestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'P2',
    "preconditions" TEXT,
    "steps" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "script" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "TestCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCase_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TestCaseGroup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_TestCase" (
    "id",
    "projectId",
    "groupId",
    "code",
    "name",
    "priority",
    "preconditions",
    "steps",
    "enabled",
    "script",
    "createdAt",
    "updatedAt",
    "deletedAt"
)
SELECT
    "TestCase"."id",
    "TestCase"."projectId",
    "TestCase"."groupId",
    "TestCase"."code",
    "TestCase"."name",
    "TestCase"."priority",
    "TestCase"."preconditions",
    COALESCE(
        (
            SELECT GROUP_CONCAT("numberedStep", CHAR(10))
            FROM (
                SELECT
                    CAST(
                        ROW_NUMBER() OVER (
                            ORDER BY "TestStep"."position", "TestStep"."createdAt", "TestStep"."id"
                        ) AS TEXT
                    ) || '. ' || TRIM("TestStep"."action") ||
                    CASE
                        WHEN TRIM("TestStep"."expectedResult") = '' THEN ''
                        ELSE '，' || TRIM("TestStep"."expectedResult")
                    END AS "numberedStep"
                FROM "TestStep"
                WHERE
                    "TestStep"."testCaseId" = "TestCase"."id"
                    AND "TestStep"."deletedAt" IS NULL
                ORDER BY "TestStep"."position", "TestStep"."createdAt", "TestStep"."id"
            )
        ),
        ''
    ),
    "TestCase"."enabled",
    "TestCase"."script",
    "TestCase"."createdAt",
    "TestCase"."updatedAt",
    "TestCase"."deletedAt"
FROM "TestCase";

DROP TABLE "TestStep";
DROP TABLE "TestCase";
ALTER TABLE "new_TestCase" RENAME TO "TestCase";
CREATE UNIQUE INDEX "TestCase_code_key" ON "TestCase"("code");
CREATE INDEX "TestCase_projectId_deletedAt_updatedAt_idx" ON "TestCase"("projectId", "deletedAt", "updatedAt");
CREATE INDEX "TestCase_groupId_deletedAt_idx" ON "TestCase"("groupId", "deletedAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
