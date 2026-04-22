-- CreateTable
CREATE TABLE "ProjectEvalConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "evalName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "template" TEXT
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "LlmProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL DEFAULT '',
    "headers" TEXT NOT NULL DEFAULT '[]',
    "queryCol" TEXT NOT NULL DEFAULT '',
    "contextCol" TEXT NOT NULL DEFAULT '',
    "evalNames" TEXT NOT NULL DEFAULT '[]',
    "evalOverrides" TEXT NOT NULL DEFAULT '{}',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "rows" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DatasetRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "DatasetRow_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DatasetRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetId" TEXT NOT NULL,
    "agentSource" TEXT NOT NULL DEFAULT '',
    "evalNames" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'running',
    "rowResults" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DatasetRun_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DatasetRunResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "rowIdx" INTEGER NOT NULL,
    "response" TEXT NOT NULL DEFAULT '',
    "query" TEXT NOT NULL DEFAULT '',
    "evals" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "DatasetRunResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DatasetRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EvalPrompt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "projectId" TEXT,
    "evalType" TEXT NOT NULL DEFAULT 'llm_prompt',
    "outputMode" TEXT NOT NULL DEFAULT 'score',
    "template" TEXT NOT NULL DEFAULT '',
    "ruleConfig" TEXT NOT NULL DEFAULT '{}',
    "badgeLabel" TEXT NOT NULL DEFAULT '',
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_EvalPrompt" ("id", "name", "template", "updatedAt") SELECT "id", "name", "template", "updatedAt" FROM "EvalPrompt";
DROP TABLE "EvalPrompt";
ALTER TABLE "new_EvalPrompt" RENAME TO "EvalPrompt";
CREATE UNIQUE INDEX "EvalPrompt_name_projectId_key" ON "EvalPrompt"("name", "projectId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ProjectEvalConfig_projectId_evalName_key" ON "ProjectEvalConfig"("projectId", "evalName");

-- CreateIndex
CREATE UNIQUE INDEX "LlmProvider_provider_key" ON "LlmProvider"("provider");

-- CreateIndex
CREATE INDEX "DatasetRow_datasetId_rowIndex_idx" ON "DatasetRow"("datasetId", "rowIndex");

-- CreateIndex
CREATE INDEX "DatasetRunResult_runId_rowIdx_idx" ON "DatasetRunResult"("runId", "rowIdx");
