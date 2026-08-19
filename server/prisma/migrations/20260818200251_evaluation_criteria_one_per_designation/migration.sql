-- AlterTable
ALTER TABLE "ScoringTemplate" DROP COLUMN "isDefault";

-- CreateIndex
CREATE UNIQUE INDEX "ScoringTemplate_designationId_key" ON "ScoringTemplate"("designationId");
