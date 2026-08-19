import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// Cross-drive funnel + selected-vs-target, grouped by department/designation,
// for a whole cycle — the roll-up view of every drive's "Result Summary" block.
//
// Applicants and Round 1 counts are manually entered per drive (this tool has
// no visibility into the applicant pool or the Round 1 process — both happen
// outside it). Round 2 and Selections are computed from actual candidate
// records rather than typed in, since only Round-2-qualified candidates are
// ever entered here and final status is already tracked per candidate.
router.get("/cycle/:cycleId", async (req, res) => {
  const cycleId = req.params.cycleId;

  const [targets, drives] = await Promise.all([
    prisma.hiringTarget.findMany({
      where: { cycleId },
      include: { department: true, designation: true },
    }),
    prisma.drive.findMany({
      where: { cycleId },
      include: {
        college: true,
        department: true,
        designation: true,
        candidates: { include: { status: true } },
      },
    }),
  ]);

  const rows = drives.map((drive) => {
    const round2 = drive.candidates.length;
    const selected = drive.candidates.filter((c) => c.status?.status === "SELECTED").length;
    const rejected = drive.candidates.filter((c) => c.status?.status === "REJECTED").length;
    const tbd = drive.candidates.filter((c) => !c.status || c.status.status === "TBD").length;
    return {
      driveId: drive.id,
      college: drive.college.name,
      department: drive.department.name,
      designation: drive.designation.name,
      status: drive.status,
      targetCount: drive.targetCount,
      applicants: drive.applicantCount ?? 0,
      round1: drive.round1Count ?? 0,
      round2,
      selected,
      rejected,
      tbd,
    };
  });

  const targetByKey = new Map(
    targets.map((t) => [`${t.departmentId}:${t.designationId}`, t.targetCount])
  );
  const selectedByKey = new Map<string, number>();
  for (const drive of drives) {
    const key = `${drive.departmentId}:${drive.designationId}`;
    const selected = drive.candidates.filter((c) => c.status?.status === "SELECTED").length;
    selectedByKey.set(key, (selectedByKey.get(key) ?? 0) + selected);
  }

  const summary = targets.map((t) => {
    const key = `${t.departmentId}:${t.designationId}`;
    return {
      department: t.department.name,
      designation: t.designation.name,
      target: t.targetCount,
      hired: selectedByKey.get(key) ?? 0,
    };
  });

  res.json({ rows, summary });
});

export default router;
