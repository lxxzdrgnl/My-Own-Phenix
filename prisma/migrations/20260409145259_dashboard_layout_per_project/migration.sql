-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DashboardLayout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "project" TEXT NOT NULL DEFAULT 'default',
    "layout" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DashboardLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DashboardLayout" ("id", "layout", "updatedAt", "userId") SELECT "id", "layout", "updatedAt", "userId" FROM "DashboardLayout";
DROP TABLE "DashboardLayout";
ALTER TABLE "new_DashboardLayout" RENAME TO "DashboardLayout";
CREATE UNIQUE INDEX "DashboardLayout_userId_project_key" ON "DashboardLayout"("userId", "project");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
