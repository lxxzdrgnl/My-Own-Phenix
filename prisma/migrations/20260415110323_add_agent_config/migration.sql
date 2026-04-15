-- CreateTable
CREATE TABLE "AgentConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project" TEXT NOT NULL,
    "agentType" TEXT NOT NULL DEFAULT 'langgraph',
    "endpoint" TEXT NOT NULL DEFAULT 'http://localhost:2024',
    "assistantId" TEXT NOT NULL DEFAULT 'agent',
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentConfig_project_key" ON "AgentConfig"("project");
