-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "emergencyContact" TEXT;
ALTER TABLE "Activity" ADD COLUMN "incidentProcedure" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ActivityRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "review" TEXT,
    "rating" INTEGER,
    "certificateIssued" BOOLEAN NOT NULL DEFAULT false,
    "orientationGiven" BOOLEAN NOT NULL DEFAULT false,
    "followUpSent" BOOLEAN NOT NULL DEFAULT false,
    "reviewedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityRecord_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ActivityRecord_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ActivityRecord" ("applicationId", "attended", "certificateIssued", "createdAt", "id", "review", "reviewedByUserId") SELECT "applicationId", "attended", "certificateIssued", "createdAt", "id", "review", "reviewedByUserId" FROM "ActivityRecord";
DROP TABLE "ActivityRecord";
ALTER TABLE "new_ActivityRecord" RENAME TO "ActivityRecord";
CREATE UNIQUE INDEX "ActivityRecord_applicationId_key" ON "ActivityRecord"("applicationId");
CREATE TABLE "new_Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "verifiedStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "insuranceInfo" TEXT NOT NULL,
    "insuranceUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "specialBadges" TEXT,
    "representativeUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Organization_representativeUserId_fkey" FOREIGN KEY ("representativeUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Organization" ("category", "createdAt", "description", "id", "insuranceInfo", "name", "representativeUserId", "verifiedStatus") SELECT "category", "createdAt", "description", "id", "insuranceInfo", "name", "representativeUserId", "verifiedStatus" FROM "Organization";
DROP TABLE "Organization";
ALTER TABLE "new_Organization" RENAME TO "Organization";
CREATE UNIQUE INDEX "Organization_representativeUserId_key" ON "Organization"("representativeUserId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
