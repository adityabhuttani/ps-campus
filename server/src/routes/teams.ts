import { Router } from "express";
import { z } from "zod";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const cycleId = req.query.cycleId as string | undefined;
  const teams = await prisma.team.findMany({
    where: cycleId ? { cycleId } : undefined,
    include: {
      captain: { select: { id: true, name: true, email: true, designation: true } },
      members: { include: { user: { select: { id: true, name: true, email: true, designation: true } } } },
    },
    orderBy: { name: "asc" },
  });
  res.json(teams);
});

const teamSchema = z.object({
  cycleId: z.string().min(1),
  name: z.string().min(1),
  captainId: z.string().min(1),
  size: z.number().int().min(3).max(5),
  memberIds: z.array(z.string().min(1)).default([]),
  isComplete: z.boolean().optional(),
});

router.post("/", requireRole(UserRole.ADMIN), async (req, res) => {
  const parsed = teamSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  const { cycleId, name, captainId, size, memberIds } = parsed.data;

  if (memberIds.length > size - 1) {
    return res.status(400).json({ error: `A panel of ${size} can have at most ${size - 1} panelists besides the captain` });
  }

  const team = await prisma.team.create({
    data: {
      cycleId,
      name,
      captainId,
      size,
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
    include: { captain: true, members: { include: { user: true } } },
  });
  res.status(201).json(team);
});

// memberIds is re-declared without its `.default([])` here: that default
// makes a PATCH omitting memberIds parse as memberIds: [], which the diff
// logic below then reads as "remove everyone." Only touch membership when
// the caller actually sent the field.
const teamPatchSchema = teamSchema
  .partial({ cycleId: true, name: true, captainId: true, size: true })
  .extend({ memberIds: z.array(z.string().min(1)).optional() });

router.patch("/:id", requireRole(UserRole.ADMIN), async (req, res) => {
  const parsed = teamPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  const { memberIds, ...rest } = parsed.data;

  if (memberIds) {
    const size = rest.size ?? (await prisma.team.findUnique({ where: { id: req.params.id }, select: { size: true } }))?.size ?? 4;
    if (memberIds.length > size - 1) {
      return res.status(400).json({ error: `A panel of ${size} can have at most ${size - 1} panelists besides the captain` });
    }
  }

  const team = await prisma.$transaction(async (tx) => {
    if (memberIds) {
      // Diffed add/remove rather than delete-all-then-recreate: two rapid
      // edits to the same team (e.g. a checkbox toggled quickly) can
      // otherwise race and hit the (teamId, userId) unique constraint on a
      // plain deleteMany+createMany. skipDuplicates is a second line of
      // defense for the same race.
      const desired = new Set(memberIds);
      const existing = await tx.teamMember.findMany({ where: { teamId: req.params.id }, select: { userId: true } });
      const existingIds = new Set(existing.map((m) => m.userId));
      const toAdd = [...desired].filter((id) => !existingIds.has(id));
      const toRemove = [...existingIds].filter((id) => !desired.has(id));

      if (toRemove.length) {
        await tx.teamMember.deleteMany({ where: { teamId: req.params.id, userId: { in: toRemove } } });
      }
      if (toAdd.length) {
        await tx.teamMember.createMany({
          data: toAdd.map((userId) => ({ teamId: req.params.id, userId })),
          skipDuplicates: true,
        });
      }
    }
    return tx.team.update({
      where: { id: req.params.id },
      data: rest,
      include: { captain: true, members: { include: { user: true } } },
    });
  });
  res.json(team);
});

// Cascades to the team's own member rows; blocked (with a clear message,
// rather than a raw 500) if any drive still points at this team.
router.delete("/:id", requireRole(UserRole.ADMIN), async (req, res) => {
  try {
    await prisma.team.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return res.status(409).json({ error: "This team is still assigned to one or more drives — delete or reassign those drives first" });
    }
    throw err;
  }
});

export default router;
