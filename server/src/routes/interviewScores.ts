import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { roleAtLeast } from "../lib/auth";
import { driveWriteBlockedFor } from "../lib/driveLock";
import { emitToDrive } from "../lib/socket";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const driveId = req.query.driveId as string | undefined;
  if (!driveId) return res.status(400).json({ error: "driveId is required" });
  const scores = await prisma.interviewScore.findMany({
    where: { candidate: { driveId } },
    include: { panelist: { select: { id: true, name: true } }, criterion: true },
  });
  res.json(scores);
});

const scoreSchema = z.object({
  candidateId: z.string().min(1),
  criterionId: z.string().min(1),
  score: z.number().min(1).max(5),
  remarks: z.string().optional(),
});

// Upserting on (candidate, panelist, criterion) is what makes this an autosave:
// the panelist's UI calls this on every field change/blur, not just on "submit".
router.put("/", async (req: AuthedRequest, res) => {
  const parsed = scoreSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  const { candidateId, criterionId, score, remarks } = parsed.data;

  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });
  if (!candidate.assignedPanelistId) {
    return res.status(400).json({ error: "This candidate has not been assigned a panelist yet" });
  }

  // Each candidate is interviewed by exactly one assigned panelist, not the
  // whole panel jointly — only that panelist (or a captain/admin correcting
  // on their behalf) may submit scores for them. The row is always keyed to
  // the assigned panelist, never to whoever is actually typing: a captain
  // correction must overwrite that panelist's score, not create a second row
  // under the captain's own id that then gets silently averaged in.
  const isAssignedPanelist = candidate.assignedPanelistId === req.user!.id;
  if (!isAssignedPanelist && !roleAtLeast(req.user!.role, UserRole.CAPTAIN)) {
    return res.status(403).json({ error: "You are not the assigned panelist for this candidate" });
  }

  const blocked = await driveWriteBlockedFor(candidate.driveId, req.user!.role);
  if (blocked) return res.status(403).json({ error: blocked });

  const panelistId = candidate.assignedPanelistId;
  const saved = await prisma.interviewScore.upsert({
    where: { candidateId_panelistId_criterionId: { candidateId, panelistId, criterionId } },
    create: { candidateId, panelistId, criterionId, score, remarks },
    update: { score, remarks },
    include: { panelist: { select: { id: true, name: true } }, criterion: true },
  });

  await ensureCandidateStatus(candidateId);
  const consolidated = await consolidatedScore(candidateId);

  emitToDrive(candidate.driveId, "score:updated", { candidateId, score: saved, consolidated });
  res.json(saved);
});

async function ensureCandidateStatus(candidateId: string) {
  await prisma.candidateStatus.upsert({
    where: { candidateId },
    create: { candidateId },
    update: {},
  });
}

// Pure weighted-average calculation over already-loaded data. Split out from
// consolidatedScore below so callers that have already fetched criteria and
// scores (e.g. a panelist's whole candidate list) can compute in memory
// instead of firing one nested query per candidate.
export function weightedScore(
  criteria: { id: string; weight: number }[],
  scores: { criterionId: string; score: number }[]
): number {
  // Normally exactly one panelist (the assigned interviewer) has scored this
  // candidate, so this reduces to their weighted score directly. Averaging
  // per criterion first only matters if a captain/admin also submits a
  // correction alongside the assigned panelist's own scores.
  const byCriterion = new Map<string, number[]>();
  for (const s of scores) {
    byCriterion.set(s.criterionId, [...(byCriterion.get(s.criterionId) ?? []), s.score]);
  }

  let total = 0;
  for (const criterion of criteria) {
    const forCriterion = byCriterion.get(criterion.id);
    if (!forCriterion || forCriterion.length === 0) continue;
    const avg = forCriterion.reduce((a, b) => a + b, 0) / forCriterion.length;
    total += avg * criterion.weight;
  }
  return total;
}

export async function consolidatedScore(candidateId: string): Promise<number> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: {
      drive: { include: { designation: { include: { scoringTemplate: { include: { criteria: true } } } } } },
      interviewScores: true,
    },
  });
  if (!candidate) return 0;
  return weightedScore(candidate.drive.designation.scoringTemplate!.criteria, candidate.interviewScores);
}

export default router;
