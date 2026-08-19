-- DropForeignKey
ALTER TABLE "Drive" DROP CONSTRAINT "Drive_scoringTemplateId_fkey";

-- AlterTable
ALTER TABLE "Drive" DROP COLUMN "scoringTemplateId";
