import { Router } from "express";
import { z } from "zod";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

// Cycles, departments, designations and colleges: simple named lookup tables,
// all admin-managed the same way, so they share one router.
const router = Router();
router.use(requireAuth);

const nameSchema = z.object({ name: z.string().min(1) });

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

router.get("/departments", async (_req, res) => {
  res.json(await prisma.department.findMany({ orderBy: { name: "asc" } }));
});
router.post("/departments", requireRole(UserRole.ADMIN), async (req, res) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  try {
    res.status(201).json(await prisma.department.create({ data: parsed.data }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "A department with that name already exists" });
    }
    throw err;
  }
});
router.patch("/departments/:id", requireRole(UserRole.ADMIN), async (req, res) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  try {
    res.json(await prisma.department.update({ where: { id: req.params.id }, data: parsed.data }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "A department with that name already exists" });
    }
    throw err;
  }
});
// Drive.departmentId and User.departmentId aren't cascading, so the DB
// would already reject this with a raw FK error — checked explicitly here
// instead so the message names what's actually blocking it.
router.delete("/departments/:id", requireRole(UserRole.ADMIN), async (req, res) => {
  const [driveCount, userCount] = await Promise.all([
    prisma.drive.count({ where: { departmentId: req.params.id } }),
    prisma.user.count({ where: { departmentId: req.params.id } }),
  ]);
  if (driveCount > 0) {
    return res.status(409).json({ error: `Still used by ${plural(driveCount, "drive")} — remove those first` });
  }
  if (userCount > 0) {
    return res.status(409).json({ error: `Still assigned to ${plural(userCount, "staff member")} — reassign them first` });
  }
  await prisma.department.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

router.get("/designations", async (_req, res) => {
  res.json(await prisma.designation.findMany({ orderBy: { sortOrder: "asc" } }));
});
router.post("/designations", requireRole(UserRole.ADMIN), async (req, res) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  const { _max } = await prisma.designation.aggregate({ _max: { sortOrder: true } });
  try {
    res.status(201).json(
      await prisma.designation.create({ data: { ...parsed.data, sortOrder: (_max.sortOrder ?? -1) + 1 } })
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "A designation with that name already exists" });
    }
    throw err;
  }
});
router.patch("/designations/:id", requireRole(UserRole.ADMIN), async (req, res) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  try {
    res.json(await prisma.designation.update({ where: { id: req.params.id }, data: parsed.data }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "A designation with that name already exists" });
    }
    throw err;
  }
});
// Drive.designationId blocks deletion (not cascading); HiringTarget and the
// designation's evaluation-criteria rubric cascade away silently, which is
// acceptable — targets are cheap to re-enter and a rubric is meaningless
// without the designation it belongs to.
router.delete("/designations/:id", requireRole(UserRole.ADMIN), async (req, res) => {
  const driveCount = await prisma.drive.count({ where: { designationId: req.params.id } });
  if (driveCount > 0) {
    return res.status(409).json({ error: `Still used by ${plural(driveCount, "drive")} — remove those first` });
  }
  await prisma.designation.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

router.get("/colleges", async (_req, res) => {
  res.json(await prisma.college.findMany({ orderBy: { name: "asc" } }));
});
router.post("/colleges", requireRole(UserRole.ADMIN), async (req, res) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  try {
    res.status(201).json(await prisma.college.create({ data: parsed.data }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "A college with that name already exists" });
    }
    throw err;
  }
});
router.patch("/colleges/:id", requireRole(UserRole.ADMIN), async (req, res) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  try {
    res.json(await prisma.college.update({ where: { id: req.params.id }, data: parsed.data }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "A college with that name already exists" });
    }
    throw err;
  }
});
// Drive.collegeId cascades in the schema, so the DB would happily wipe out
// every drive (and its candidates/scores) for this college with no error —
// checked explicitly here so that can never happen silently.
router.delete("/colleges/:id", requireRole(UserRole.ADMIN), async (req, res) => {
  const driveCount = await prisma.drive.count({ where: { collegeId: req.params.id } });
  if (driveCount > 0) {
    return res.status(409).json({ error: `Still used by ${plural(driveCount, "drive")} — remove those first` });
  }
  await prisma.college.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

const cycleSchema = z.object({
  name: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isActive: z.boolean().optional(),
});

router.get("/cycles", async (_req, res) => {
  res.json(await prisma.hiringCycle.findMany({ orderBy: { startDate: "desc" } }));
});
router.post("/cycles", requireRole(UserRole.ADMIN), async (req, res) => {
  const parsed = cycleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  try {
    res.status(201).json(await prisma.hiringCycle.create({ data: parsed.data }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "A cycle with that name already exists" });
    }
    throw err;
  }
});
router.patch("/cycles/:id", requireRole(UserRole.ADMIN), async (req, res) => {
  const parsed = cycleSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  try {
    res.json(await prisma.hiringCycle.update({ where: { id: req.params.id }, data: parsed.data }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "A cycle with that name already exists" });
    }
    throw err;
  }
});
// Team and Drive both cascade from HiringCycle, so deleting a cycle with
// either would silently wipe an entire season's panels/drives/candidates.
// Blocked outright rather than allowed-with-a-scarier-confirmation — only
// an empty, never-used cycle can be deleted. HiringTargets alone don't
// block, since they're just numbers and cheap to re-enter.
router.delete("/cycles/:id", requireRole(UserRole.ADMIN), async (req, res) => {
  const [teamCount, driveCount] = await Promise.all([
    prisma.team.count({ where: { cycleId: req.params.id } }),
    prisma.drive.count({ where: { cycleId: req.params.id } }),
  ]);
  if (teamCount > 0 || driveCount > 0) {
    return res.status(409).json({
      error: `This cycle still has ${plural(teamCount, "team")} and ${plural(driveCount, "drive")} — it can't be deleted while those exist`,
    });
  }
  await prisma.hiringCycle.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
