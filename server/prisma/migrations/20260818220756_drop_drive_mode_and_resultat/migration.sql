-- AlterTable
ALTER TABLE "Drive" DROP COLUMN "oaMode",
DROP COLUMN "piMode",
DROP COLUMN "pptMode",
DROP COLUMN "resultAt";

-- DropEnum
DROP TYPE "EventMode";
