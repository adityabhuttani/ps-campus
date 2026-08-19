-- AlterTable
ALTER TABLE "Designation" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill the seniority-ladder order: BA, SBA, Consultant, SC
UPDATE "Designation" SET "sortOrder" = 0 WHERE "name" = 'BA';
UPDATE "Designation" SET "sortOrder" = 1 WHERE "name" = 'SBA';
UPDATE "Designation" SET "sortOrder" = 2 WHERE "name" = 'Consultant';
UPDATE "Designation" SET "sortOrder" = 3 WHERE "name" = 'SC';
