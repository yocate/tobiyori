-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN "availableDays" TEXT;
ALTER TABLE "StudentProfile" ADD COLUMN "preferredCity" TEXT;
ALTER TABLE "StudentProfile" ADD COLUMN "transportMethod" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "dateTime" DATETIME NOT NULL,
    "participationTypes" TEXT NOT NULL,
    "beginnerFriendly" BOOLEAN NOT NULL DEFAULT false,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "insuranceCovered" BOOLEAN NOT NULL DEFAULT false,
    "capacity" INTEGER NOT NULL DEFAULT 10,
    "transportNote" TEXT,
    "emergencyContact" TEXT,
    "incidentProcedure" TEXT,
    "durationMinutes" INTEGER,
    "parkingAvailable" BOOLEAN NOT NULL DEFAULT false,
    "transportCost" TEXT,
    "contactPerson" TEXT,
    "itemsToBring" TEXT,
    "photoPolicy" TEXT,
    "prohibitedNotes" TEXT,
    "isHelpRequest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Activity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Activity" ("beginnerFriendly", "capacity", "city", "createdAt", "dateTime", "description", "emergencyContact", "genre", "id", "incidentProcedure", "insuranceCovered", "lat", "lng", "orgId", "participationTypes", "riskLevel", "title", "transportNote") SELECT "beginnerFriendly", "capacity", "city", "createdAt", "dateTime", "description", "emergencyContact", "genre", "id", "incidentProcedure", "insuranceCovered", "lat", "lng", "orgId", "participationTypes", "riskLevel", "title", "transportNote" FROM "Activity";
DROP TABLE "Activity";
ALTER TABLE "new_Activity" RENAME TO "Activity";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
