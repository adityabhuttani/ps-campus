import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const cycleId = req.query.cycleId as string | undefined;
  if (!cycleId) return res.status(400).json({ error: "cycleId is required" });
  const targets = await prisma.hiringTarget.findMany({
    where: { cycleId },
    include: { department: true, designation: true },
  });
  res.json(targets);
});

const upsertSchema = z.object({
  cycleId: z.string().min(1),
  departmentId: z.string().min(1),
  designationId: z.string().min(1),
  targetCount: z.number().int().min(0),
});

// Targets are entered as a department x designation grid, so setting one cell
// is an upsert on the (cycle, department, designation) unique key.
router.put("/", requireRole(UserRole.ADMIN), async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  const { cycleId, departmentId, designationId, targetCount } = parsed.data;

  const target = await prisma.hiringTarget.upsert({
    where: { cycleId_departmentId_designationId: { cycleId, departmentId, designationId } },
    create: { cycleId, departmentId, designationId, targetCount },
    update: { targetCount },
  });
  res.json(target);
});

export default router;
