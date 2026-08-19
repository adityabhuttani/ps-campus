import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth, requireRole } from "../middleware/auth";
import { roleAtLeast } from "../lib/auth";
import { driveWriteBlockedFor } from "../lib/driveLock";
import { emitToDrive } from "../lib/socket";
import { weightedScore } from "./interviewScores";

const router = Router();
router.use(requireAuth);

// Everything a captain/admin needs for the live dashboard and round table in one
// call: every candidate in the drive, every panelist's score per criterion, the
// consolidated score, and current status — the completion matrix is derived
// client-side from this.
router.get("/drive/:driveId/board", async (req, res) => {
  const driveId = req.params.driveId;
  const [drive, candidates, scores] = await Promise.all([
    prisma.drive.findUnique({
      where: { id: driveId },
      include: {
        designation: {
          include: { scoringTemplate: { include: { criteria: { orderBy: { sortOrder: "asc" } } } } },
        },
        team: { include: { members: { include: { user: true } }, captain: true, shadowPanelist: true } },
      },
    }),
    prisma.candidate.findMany({
      where: { driveId },
      include: { status: true, assignedPanelist: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.interviewScore.findMany({
      where: { candidate: { driveId } },
      include: { panelist: { select: { id: true, name: true } }, criterion: true },
    }),
  ]);
  if (!drive) return res.status(404).json({ error: "Not found" });

  // Computed in memory from the criteria and scores already fetched above.
  // This previously called consolidatedScore() per candidate, which issued a
  // fresh nested query each time — sequentially. Against a hosted database
  // ~1s away that made this endpoint take 30s for ten candidates, and it grew
  // linearly with the roster.
  const criteria = drive.designation.scoringTemplate?.criteria ?? [];
  const scoresByCandidate = new Map<string, typeof scores>();
  for (const s of scores) {
    scoresByCandidate.set(s.candidateId, [...(scoresByCandidate.get(s.candidateId) ?? []), s]);
  }

  const consolidated: Record<string, number> = {};
  for (const c of candidates) {
    consolidated[c.id] = weightedScore(criteria, scoresByCandidate.get(c.id) ?? []);
  }

  res.json({ drive, candidates, scores, consolidated });
});

const statusSchema = z.object({
  status: z.enum(["TBD", "SELECTED", "REJECTED"]),
  roundTableNotes: z.string().optional(),
});

// Each candidate has exactly one assigned panelist, not a panel jointly
// reviewing them — so that panelist's Selected/Rejected/TBD call (plus their
// final remarks) IS the real decision, not a preliminary opinion for a
// captain to reconcile later. Captains/admins can still set or correct it.
router.put("/candidate/:candidateId", async (req: AuthedRequest, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

  const candidate = await prisma.candidate.findUnique({ where: { id: req.params.candidateId } });
  if (!candidate) return res.status(404).json({ error: "Not found" });

  const isAssignedPanelist = candidate.assignedPanelistId === req.user!.id;
  if (!isAssignedPanelist && !roleAtLeast(req.user!.role, UserRole.CAPTAIN)) {
    return res.status(403).json({ error: "You are not the assigned panelist for this candidate" });
  }

  const blocked = await driveWriteBlockedFor(candidate.driveId, req.user!.role);
  if (blocked) return res.status(403).json({ error: blocked });

  const status = await prisma.candidateStatus.upsert({
    where: { candidateId: req.params.candidateId },
    create: {
      candidateId: req.params.candidateId,
      ...parsed.data,
      finalizedById: req.user!.id,
      finalizedAt: new Date(),
    },
    update: { ...parsed.data, finalizedById: req.user!.id, finalizedAt: new Date() },
  });

  emitToDrive(candidate.driveId, "status:updated", { candidateId: candidate.id, status });
  res.json(status);
});

// The assigned panelist declaring their evaluation complete. Scores and
// remarks already autosave as they're entered, so this doesn't persist the
// work — it records that the panelist considers it finished, which is what
// makes "12 of 15 evaluations in" a trustworthy number for a captain.
// Gated on the evaluation actually being complete so a half-filled sheet
// can't be marked done by accident.
router.post("/candidate/:candidateId/submit", async (req: AuthedRequest, res) => {
  const candidate = await prisma.candidate.findUnique({
    where: { id: req.params.candidateId },
    include: {
      status: true,
      interviewScores: true,
      drive: { include: { designation: { include: { scoringTemplate: { include: { criteria: true } } } } } },
    },
  });
  if (!candidate) return res.status(404).json({ error: "Not found" });

  const isAssignedPanelist = candidate.assignedPanelistId === req.user!.id;
  if (!isAssignedPanelist && !roleAtLeast(req.user!.role, UserRole.CAPTAIN)) {
    return res.status(403).json({ error: "You are not the assigned panelist for this candidate" });
  }

  const blocked = await driveWriteBlockedFor(candidate.driveId, req.user!.role);
  if (blocked) return res.status(403).json({ error: blocked });

  const criteria = candidate.drive.designation.scoringTemplate?.criteria ?? [];
  const scoredCriterionIds = new Set(
    candidate.interviewScores.filter((s) => s.panelistId === candidate.assignedPanelistId).map((s) => s.criterionId)
  );
  const missing = criteria.filter((c) => !scoredCriterionIds.has(c.id));
  if (missing.length > 0) {
    return res.status(400).json({ error: `Score every criterion first — still missing: ${missing.map((c) => c.label).join(", ")}` });
  }
  if (!candidate.status || candidate.status.status === "TBD") {
    return res.status(400).json({ error: "Set a final call (Selected or Rejected) before submitting" });
  }

  const status = await prisma.candidateStatus.update({
    where: { candidateId: req.params.candidateId },
    data: { submittedAt: new Date() },
  });

  emitToDrive(candidate.driveId, "status:updated", { candidateId: candidate.id, status });
  res.json(status);
});

// Locks the drive. Panelists lose write access to everything under it from
// this point on (enforced server-side via driveWriteBlockedFor, not just by
// hiding UI controls); captains and admins keep it so a result can still be
// corrected after the fact.
router.post("/drive/:driveId/finalize", requireRole(UserRole.CAPTAIN), async (req, res) => {
  const drive = await prisma.drive.update({
    where: { id: req.params.driveId },
    data: { status: "FINALIZED" },
  });
  emitToDrive(drive.id, "drive:finalized", { driveId: drive.id });
  res.json(drive);
});

export default router;
