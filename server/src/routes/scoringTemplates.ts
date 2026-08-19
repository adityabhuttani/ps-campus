import { Router } from "express";
import { z } from "zod";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const designationId = req.query.designationId as string | undefined;
  const templates = await prisma.scoringTemplate.findMany({
    where: designationId ? { designationId } : undefined,
    include: { criteria: { orderBy: { sortOrder: "asc" } }, designation: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(templates);
});

const criterionSchema = z.object({
  label: z.string().min(1),
  weight: z.number().gt(0).lte(1),
});

function validateCriteria(criteria: { label: string; weight: number }[]): string | null {
  const labels = new Set(criteria.map((c) => c.label.trim().toLowerCase()));
  if (labels.size !== criteria.length) return "Criterion labels must be unique";
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  if (Math.abs(totalWeight - 1) > 0.01) {
    return `Criteria weights must sum to 100% (got ${Math.round(totalWeight * 100)}%)`;
  }
  return null;
}

const createSchema = z.object({
  name: z.string().min(1),
  designationId: z.string().min(1),
  criteria: z.array(criterionSchema).min(1),
});

// One rubric per designation (enforced by a unique constraint on
// designationId), so this only ever runs for a designation that doesn't
// have one yet — everything after that goes through PATCH below.
router.post("/", requireRole(UserRole.ADMIN), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  const { name, designationId, criteria } = parsed.data;

  const validationError = validateCriteria(criteria);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const template = await prisma.scoringTemplate.create({
      data: {
        name,
        designationId,
        criteria: {
          create: criteria.map((c, i) => ({ label: c.label, weight: c.weight, sortOrder: i })),
        },
      },
      include: { criteria: { orderBy: { sortOrder: "asc" } } },
    });
    res.status(201).json(template);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "This designation already has a rubric" });
    }
    throw err;
  }
});

const updateSchema = z.object({
  criteria: z.array(criterionSchema).min(1),
});

// Replaces a rubric's criteria wholesale in one transaction, rather than
// diffing — an admin editing a rubric is a single deliberate save, not
// concurrent checkbox toggles, so delete-and-recreate is simplest here.
router.patch("/:id", requireRole(UserRole.ADMIN), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  const { criteria } = parsed.data;

  const validationError = validateCriteria(criteria);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const template = await prisma.$transaction(async (tx) => {
      await tx.scoringCriterion.deleteMany({ where: { templateId: req.params.id } });
      return tx.scoringTemplate.update({
        where: { id: req.params.id },
        data: {
          criteria: {
            create: criteria.map((c, i) => ({ label: c.label, weight: c.weight, sortOrder: i })),
          },
        },
        include: { criteria: { orderBy: { sortOrder: "asc" } } },
      });
    });
    res.json(template);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return res.status(409).json({
        error: "This rubric has already been used to score candidates, so its criteria can't be changed anymore",
      });
    }
    throw err;
  }
});

export default router;
