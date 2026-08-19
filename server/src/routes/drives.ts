import { Router } from "express";
import { z } from "zod";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth, requireRole } from "../middleware/auth";
import { roleAtLeast } from "../lib/auth";

const router = Router();
router.use(requireAuth);

// Shared by both shapes below: enough to identify a drive and roll up its
// candidate stage counts.
const driveBaseInclude = {
  college: true,
  department: true,
  team: { include: { captain: { select: { id: true, name: true, email: true } } } },
  // Only fetched to derive displayStatus/round2Count/selectionsCount below —
  // stripped from the response before it goes out, so the client never sees
  // raw candidate data here (it fetches candidates separately, in full, from
  // the Candidates tab).
  candidates: {
    select: {
      oaScore: true,
      status: { select: { status: true } },
      // Only "has this candidate been scored at all?" is needed. Asking for
      // the rows themselves with `take: 1` made Prisma issue a separate
      // query per candidate; _count answers it as one aggregate.
      _count: { select: { interviewScores: true } },
    },
  },
} as const;

// List views (Drives table, My Drives cards) show college / department /
// designation / team / dates / status — none of them touch the scoring
// rubric. Every nested relation Prisma has to walk is another round trip
// (~850ms against the hosted database), so the rubric's two extra levels are
// only fetched when a single drive is opened for scoring.
const driveListInclude = {
  ...driveBaseInclude,
  designation: true,
} as const;

// A single drive opened for scoring or detail. Pays for the extra relations
// the list views skip: the full panel roster (the Candidates tab assigns
// interviewers from it) and the scoring rubric.
const driveInclude = {
  ...driveBaseInclude,
  team: {
    include: {
      captain: { select: { id: true, name: true, email: true } },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  },
  // A drive's scoring rubric is derived from its designation (one rubric per
  // designation, enforced at the DB level) rather than stored on the drive
  // itself — no independent pointer that could drift out of sync.
  designation: {
    include: {
      scoringTemplate: { include: { criteria: { orderBy: { sortOrder: "asc" as const } } } },
    },
  },
} as const;

// Both shapes carry everything the computed fields below need; the list shape
// is a strict subset, so one type covers both.
type DriveWithCandidates = Prisma.DriveGetPayload<{ include: typeof driveListInclude }>;

// The DriveStatus enum only ever gets PLANNED (default) or FINALIZED
// (set once, by "Conclude") written to it — the four in-between values are
// never stored. Instead, displayStatus is recomputed from what's actually
// happened on the drive every time it's read, so the pipeline badge can
// never drift out of sync the way a manually-clicked status would.
function computeDisplayStatus(drive: DriveWithCandidates): string {
  if (drive.status === "FINALIZED") return "FINALIZED";
  const candidates = drive.candidates;
  if (candidates.length > 0 && candidates.every((c) => c.status && c.status.status !== "TBD")) return "ROUND_TABLE";
  if (candidates.some((c) => c._count.interviewScores > 0)) return "PI_IN_PROGRESS";
  if (candidates.some((c) => c.oaScore != null)) return "OA_DONE";
  if (drive.pptAt && drive.pptAt <= new Date()) return "PPT_DONE";
  return "PLANNED";
}

// Round 2 count and Selections count are computed the same way as
// displayStatus, not stored — a candidate record only ever exists here once
// someone is Round-2-qualified, and "selected" is already tracked per
// candidate, so typing either number in separately would just be a second
// copy of the truth that can drift from the first.
function withComputedFields(drive: DriveWithCandidates) {
  const { candidates, ...rest } = drive;
  return {
    ...rest,
    displayStatus: computeDisplayStatus(drive),
    round2Count: candidates.length,
    selectionsCount: candidates.filter((c) => c.status?.status === "SELECTED").length,
  };
}

router.get("/", async (req, res) => {
  const cycleId = req.query.cycleId as string | undefined;
  const drives = await prisma.drive.findMany({
    where: cycleId ? { cycleId } : undefined,
    include: driveListInclude,
    orderBy: { pptAt: "asc" },
  });
  res.json(drives.map(withComputedFields));
});

// A panelist/captain only needs to see drives their team is on ("my drives today").
router.get("/mine", async (req: AuthedRequest, res) => {
  const drives = await prisma.drive.findMany({
    where: {
      team: {
        OR: [
          { captainId: req.user!.id },
          { shadowPanelistId: req.user!.id },
          { members: { some: { userId: req.user!.id } } },
        ],
      },
    },
    include: driveListInclude,
    orderBy: { piAt: "asc" },
  });
  res.json(drives.map(withComputedFields));
});

router.get("/:id", async (req, res) => {
  const drive = await prisma.drive.findUnique({ where: { id: req.params.id }, include: driveInclude });
  if (!drive) return res.status(404).json({ error: "Not found" });
  res.json(withComputedFields(drive));
});

const driveSchema = z.object({
  cycleId: z.string().min(1),
  collegeId: z.string().min(1),
  departmentId: z.string().min(1),
  designationId: z.string().min(1),
  teamId: z.string().min(1),
  pptAt: z.coerce.date().optional(),
  oaAt: z.coerce.date().optional(),
  piAt: z.coerce.date().optional(),
  targetCount: z.number().int().min(0).optional(),
  applicantCount: z.number().int().min(0).optional(),
  round1Count: z.number().int().min(0).optional(),
});

async function designationHasRubric(designationId: string): Promise<boolean> {
  const designation = await prisma.designation.findUnique({ where: { id: designationId }, select: { scoringTemplate: { select: { id: true } } } });
  return !!designation?.scoringTemplate;
}

router.post("/", requireRole(UserRole.ADMIN), async (req, res) => {
  const parsed = driveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  if (!(await designationHasRubric(parsed.data.designationId))) {
    return res.status(400).json({ error: "This designation doesn't have evaluation criteria set up yet — add one on the Evaluation Criteria tab first" });
  }
  try {
    const drive = await prisma.drive.create({ data: parsed.data, include: driveInclude });
    res.status(201).json(withComputedFields(drive));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "A drive for this college and designation already exists in this cycle" });
    }
    throw err;
  }
});

router.patch("/:id", async (req: AuthedRequest, res) => {
  // Admins can edit every field; captains may only adjust their own drive's
  // day-to-day logistics and funnel counts, not re-plan cycle/team assignment.
  const isAdmin = roleAtLeast(req.user!.role, UserRole.ADMIN);
  const schema = isAdmin
    ? driveSchema.partial()
    : z.object({
        applicantCount: z.number().int().min(0).optional(),
        round1Count: z.number().int().min(0).optional(),
      });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

  if (!isAdmin) {
    const drive = await prisma.drive.findUnique({ where: { id: req.params.id }, select: { teamId: true } });
    const team = drive && (await prisma.team.findUnique({ where: { id: drive.teamId } }));
    if (!team || team.captainId !== req.user!.id) return res.status(403).json({ error: "Forbidden" });
  }

  const newDesignationId = isAdmin ? (parsed.data as Partial<z.infer<typeof driveSchema>>).designationId : undefined;
  if (newDesignationId && !(await designationHasRubric(newDesignationId))) {
    return res.status(400).json({ error: "This designation doesn't have evaluation criteria set up yet — add one on the Evaluation Criteria tab first" });
  }

  try {
    const updated = await prisma.drive.update({
      where: { id: req.params.id },
      data: parsed.data,
      include: driveInclude,
    });
    res.json(withComputedFields(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "A drive for this college and designation already exists in this cycle" });
    }
    throw err;
  }
});

// Cascades to the drive's candidates and everything scored against them
// (OA scores, interview scores, final status) — there's no separate
// "delete candidates first" step needed.
router.delete("/:id", requireRole(UserRole.ADMIN), async (req, res) => {
  await prisma.drive.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
