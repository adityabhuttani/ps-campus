-- DropForeignKey
ALTER TABLE "OAScore" DROP CONSTRAINT "OAScore_candidateId_fkey";

-- AlterTable
ALTER TABLE "Candidate" DROP COLUMN "majors",
DROP COLUMN "minors",
DROP COLUMN "preMbaExpMonths",
DROP COLUMN "r1Shortlisted",
DROP COLUMN "sipCompany",
ADD COLUMN     "assessmentReportUrl" TEXT,
ADD COLUMN     "cgpa" DOUBLE PRECISION,
ADD COLUMN     "cvUrl" TEXT,
ADD COLUMN     "oaScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Drive" DROP COLUMN "oaCutoff",
ADD COLUMN     "applicantCount" INTEGER,
ADD COLUMN     "round1Count" INTEGER;

-- DropTable
DROP TABLE "OAScore";
