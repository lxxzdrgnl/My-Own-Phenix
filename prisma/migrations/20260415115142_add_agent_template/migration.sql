-- CreateTable
CREATE TABLE "AgentTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "agentType" TEXT NOT NULL DEFAULT 'langgraph',
    "endpoint" TEXT NOT NULL DEFAULT 'http://localhost:2024',
    "assistantId" TEXT NOT NULL DEFAULT 'agent',
    "evalPrompts" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AgentConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project" TEXT NOT NULL,
    "alias" TEXT,
    "templateId" TEXT,
    "agentType" TEXT NOT NULL DEFAULT 'langgraph',
    "endpoint" TEXT NOT NULL DEFAULT 'http://localhost:2024',
    "assistantId" TEXT NOT NULL DEFAULT 'agent',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentConfig_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AgentTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AgentConfig" ("agentType", "alias", "assistantId", "endpoint", "id", "project", "updatedAt") SELECT "agentType", "alias", "assistantId", "endpoint", "id", "project", "updatedAt" FROM "AgentConfig";
DROP TABLE "AgentConfig";
ALTER TABLE "new_AgentConfig" RENAME TO "AgentConfig";
CREATE UNIQUE INDEX "AgentConfig_project_key" ON "AgentConfig"("project");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AgentTemplate_name_key" ON "AgentTemplate"("name");
