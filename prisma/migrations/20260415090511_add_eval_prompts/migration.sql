-- CreateTable
CREATE TABLE "EvalPrompt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "EvalPrompt_name_key" ON "EvalPrompt"("name");
