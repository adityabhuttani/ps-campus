-- CreateEnum
CREATE TYPE "StaffDesignation" AS ENUM ('CONSULTANT', 'SENIOR_CONSULTANT', 'PRINCIPAL_CONSULTANT', 'SENIOR_PRINCIPAL', 'ASSOCIATE_DIRECTOR', 'MANAGING_DIRECTOR');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "department",
ADD COLUMN     "departmentId" TEXT,
DROP COLUMN "designation",
ADD COLUMN     "designation" "StaffDesignation";

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

