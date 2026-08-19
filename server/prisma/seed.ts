import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

const DEPARTMENTS = ["Business Advisory", "AI and Data Analytics", "CFO Services", "Operations"];
const DESIGNATIONS = ["BA", "SBA", "Consultant", "SC"];

// The two scoring formats found in the source workbook: BA uses 5 criteria at 20%
// each; Consultant/SC (and by extension SBA) use 6 criteria at 1/6 each, adding
// "Problem Solving & Structured Thinking".
const FIVE_CRITERIA = [
  "Communication",
  "Validation of CV",
  "Technical",
  "Attitude",
  "Fitment",
].map((label, i) => ({ label, weight: 0.2, sortOrder: i }));

const SIX_CRITERIA = [
  "Communication",
  "Validation of CV",
  "Technical",
  "Problem Solving & Structured Thinking",
  "Attitude",
  "Fitment",
].map((label, i) => ({ label, weight: 1 / 6, sortOrder: i }));

async function main() {
  for (const name of DEPARTMENTS) {
    await prisma.department.upsert({ where: { name }, create: { name }, update: {} });
  }
  for (const [sortOrder, name] of DESIGNATIONS.entries()) {
    await prisma.designation.upsert({ where: { name }, create: { name, sortOrder }, update: { sortOrder } });
  }

  const designations = await prisma.designation.findMany();
  for (const designation of designations) {
    const criteria = designation.name === "BA" ? FIVE_CRITERIA : SIX_CRITERIA;
    const existing = await prisma.scoringTemplate.findFirst({
      where: { designationId: designation.id },
    });
    if (existing) continue;
    await prisma.scoringTemplate.create({
      data: {
        name: `${designation.name} rubric`,
        designationId: designation.id,
        criteria: { create: criteria },
      },
    });
  }

  const superAdminEmail = "aditya.b@preferredsquare.com";
  const existingAdmin = await prisma.user.findUnique({ where: { email: superAdminEmail } });
  if (!existingAdmin) {
    const tempPassword = crypto.randomBytes(6).toString("base64url");
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await prisma.user.create({
      data: {
        name: "Aditya Bhuttani",
        email: superAdminEmail,
        passwordHash,
        role: UserRole.SUPER_ADMIN,
      },
    });
    console.log("=".repeat(60));
    console.log(`Created super admin ${superAdminEmail}`);
    console.log(`Temporary password: ${tempPassword}`);
    console.log("Log in and this can stay as-is, or add a password-change flow later.");
    console.log("=".repeat(60));
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
