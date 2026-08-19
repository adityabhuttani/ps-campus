-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "assignedPanelistId" TEXT;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_assignedPanelistId_fkey" FOREIGN KEY ("assignedPanelistId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
