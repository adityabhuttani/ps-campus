import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth, requireRole } from "../middleware/auth";
import { roleAtLeast } from "../lib/auth";
import { uploadPdf } from "../lib/uploads";
import { getSignedDocumentUrl, uploadDocument, DocumentKind } from "../lib/storage";
import { driveWriteBlockedFor } from "../lib/driveLock";
import { weightedScore } from "./interviewScores";

const router = Router();
router.use(requireAuth);
const uploadCsv = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get("/", async (req, res) => {
  const driveId = req.query.driveId as string | undefined;
  if (!driveId) return res.status(400).json({ error: "driveId is required" });
  const candidates = await prisma.candidate.findMany({
    where: { driveId },
    include: { status: true, assignedPanelist: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
  res.json(candidates);
});

// Every candidate assigned to the current panelist, across every drive and
// college in the cycle — backs their personal summary. Scoped to their own
// assignments by design: each candidate is interviewed one-on-one, so a
// panelist has no reason to see another panelist's candidates here.
router.get("/mine", async (req: AuthedRequest, res) => {
  const candidates = await prisma.candidate.findMany({
    where: { assignedPanelistId: req.user!.id },
    include: {
      status: true,
      interviewScores: true,
      drive: {
        include: {
          college: true,
          department: true,
          designation: { include: { scoringTemplate: { include: { criteria: { orderBy: { sortOrder: "asc" } } } } } },
        },
      },
    },
    orderBy: [{ drive: { piAt: "asc" } }, { name: "asc" }],
  });

  // Computed in memory from data already loaded above rather than calling
  // consolidatedScore() per candidate, which would re-query for each one.
  res.json(
    candidates.map((c) => ({
      ...c,
      finalScore: weightedScore(c.drive.designation.scoringTemplate?.criteria ?? [], c.interviewScores),
    }))
  );
});

// Only candidates who've already cleared Round 1 and are qualified for PI
// are ever entered here — everything below is filled in by an admin, either
// one at a time or via bulk import.
const candidateSchema = z.object({
  rollNumber: z.string().min(1),
  name: z.string().min(1),
  gender: z.string().optional(),
  course: z.string().optional(),
  cgpa: z.coerce.number().optional(),
  oaScore: z.coerce.number().optional(),
});

// Filled in by the assigned panelist during/after the interview — these come
// up in conversation, not from a CV, so they're not part of candidateSchema.
const panelistFieldsSchema = z.object({
  hometown: z.string().optional(),
  parentsOccupation: z.string().optional(),
  higherEducationPlans: z.string().optional(),
  holdingOffer: z.string().optional(),
});

router.post("/", requireRole(UserRole.CAPTAIN), async (req, res) => {
  const parsed = z.object({ driveId: z.string().min(1) }).merge(candidateSchema).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  const { driveId, ...data } = parsed.data;
  try {
    const candidate = await prisma.candidate.create({ data: { driveId, ...data } });
    res.status(201).json(candidate);
  } catch {
    return res.status(409).json({ error: `Roll number ${data.rollNumber} already exists for this drive` });
  }
});

// Bulk import of the Round-2-qualified candidate list, expected as a CSV with
// a header row: rollNumber,name,gender,course,cgpa,oaScore
router.post("/import", requireRole(UserRole.CAPTAIN), uploadCsv.single("file"), async (req, res) => {
  const driveId = req.body.driveId as string | undefined;
  if (!driveId) return res.status(400).json({ error: "driveId is required" });
  if (!req.file) return res.status(400).json({ error: "file is required" });

  let rows: Record<string, string>[];
  try {
    rows = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
  } catch {
    return res.status(400).json({ error: "Could not parse CSV" });
  }

  const results = { created: 0, skipped: 0, errors: [] as string[] };
  for (const [i, row] of rows.entries()) {
    const parsed = candidateSchema.safeParse(row);
    if (!parsed.success) {
      results.errors.push(`Row ${i + 2}: ${parsed.error.issues.map((e) => e.message).join(", ")}`);
      results.skipped++;
      continue;
    }
    try {
      await prisma.candidate.create({ data: { driveId, ...parsed.data } });
      results.created++;
    } catch {
      results.errors.push(`Row ${i + 2}: roll number ${row.rollNumber} already exists for this drive`);
      results.skipped++;
    }
  }
  res.json(results);
});

// A candidate's own assigned panelist may fill in the background fields they
// pick up during the interview; only a captain/admin may edit the rest
// (identity/profile fields, or reassign the interviewer).
router.patch("/:id", async (req: AuthedRequest, res) => {
  const candidate = await prisma.candidate.findUnique({ where: { id: req.params.id } });
  if (!candidate) return res.status(404).json({ error: "Not found" });

  const isCaptainOrAbove = roleAtLeast(req.user!.role, UserRole.CAPTAIN);
  const isAssignedPanelist = candidate.assignedPanelistId === req.user!.id;
  if (!isCaptainOrAbove && !isAssignedPanelist) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const blocked = await driveWriteBlockedFor(candidate.driveId, req.user!.role);
  if (blocked) return res.status(403).json({ error: blocked });

  const schema = isCaptainOrAbove
    ? candidateSchema.partial().merge(panelistFieldsSchema).extend({ assignedPanelistId: z.string().min(1).nullable().optional() })
    : panelistFieldsSchema;

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

  try {
    const updated = await prisma.candidate.update({
      where: { id: req.params.id },
      data: parsed.data,
      include: { assignedPanelist: { select: { id: true, name: true } } },
    });
    res.json(updated);
  } catch {
    return res.status(409).json({ error: "That roll number already exists for this drive" });
  }
});

router.post("/:id/cv", requireRole(UserRole.CAPTAIN), uploadPdf.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "A PDF file is required" });
  await uploadDocument(req.params.id, "cv", req.file.buffer);
  const candidate = await prisma.candidate.update({
    where: { id: req.params.id },
    data: { cvUrl: `/api/candidates/${req.params.id}/documents/cv` },
  });
  res.json(candidate);
});

router.post("/:id/assessment-report", requireRole(UserRole.CAPTAIN), uploadPdf.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "A PDF file is required" });
  await uploadDocument(req.params.id, "assessment-report", req.file.buffer);
  const candidate = await prisma.candidate.update({
    where: { id: req.params.id },
    data: { assessmentReportUrl: `/api/candidates/${req.params.id}/documents/assessment-report` },
  });
  res.json(candidate);
});

// Storage bucket is private — every view mints a fresh short-lived signed URL
// rather than relying on a permanent link. requireAuth (already applied to
// this whole router) is the only gate, matching the previous static-file
// route's baseline of "any logged-in user with the link" — a real
// improvement over that route's actual previous behavior of no auth check
// at all.
router.get("/:id/documents/:kind", async (req, res) => {
  const kind = req.params.kind as DocumentKind;
  if (kind !== "cv" && kind !== "assessment-report") return res.status(404).json({ error: "Not found" });

  const url = await getSignedDocumentUrl(req.params.id, kind);
  if (!url) return res.status(404).json({ error: "Document not found" });
  res.redirect(url);
});

// Cascades to this candidate's interview scores and final status.
router.delete("/:id", requireRole(UserRole.CAPTAIN), async (req, res) => {
  await prisma.candidate.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
