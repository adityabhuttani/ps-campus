import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { Prisma, UserRole, StaffDesignation } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth";
import { emailService } from "../lib/email";
import { AuthedRequest, invalidateUserCache, requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireRole(UserRole.ADMIN));

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  department: { select: { id: true, name: true } },
  designation: true,
  createdAt: true,
} as const;

// Team/captain membership isn't stored on User — it's assigned per-cycle on
// the Teams page — so it's looked up here rather than duplicating that
// assignment step into user creation. Computed from the most recent active
// cycle's teams in one query (not per-user) to stay cheap on a small table.
async function panelByUserId(): Promise<Map<string, { teamName: string; captainName: string }>> {
  const activeCycle = await prisma.hiringCycle.findFirst({
    where: { isActive: true },
    orderBy: { startDate: "desc" },
  });
  const panelByUserId = new Map<string, { teamName: string; captainName: string }>();
  if (!activeCycle) return panelByUserId;

  const teams = await prisma.team.findMany({
    where: { cycleId: activeCycle.id },
    include: { captain: true, shadowPanelist: true, members: true },
  });
  for (const team of teams) {
    const info = { teamName: team.name, captainName: team.captain.name };
    panelByUserId.set(team.captainId, info);
    if (team.shadowPanelistId) panelByUserId.set(team.shadowPanelistId, info);
    for (const m of team.members) panelByUserId.set(m.userId, info);
  }
  return panelByUserId;
}

router.get("/", async (_req, res) => {
  const [users, panels] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" }, select: userSelect }),
    panelByUserId(),
  ]);
  res.json(users.map((u) => ({ ...u, panel: panels.get(u.id) ?? null })));
});

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.nativeEnum(UserRole),
  departmentId: z.string().min(1).optional(),
  designation: z.nativeEnum(StaffDesignation).optional(),
  // Optional: an admin can set a specific starting password instead of
  // always getting a random one generated.
  password: z.string().min(8).optional(),
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

  const { name, email, role, departmentId, designation, password } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return res.status(409).json({ error: "A user with that email already exists" });

  const tempPassword = password ?? crypto.randomBytes(6).toString("base64url");
  const passwordHash = await hashPassword(tempPassword);
  const user = await prisma.user.create({
    data: { name, email: email.toLowerCase(), role, departmentId, designation, passwordHash },
    select: userSelect,
  });

  await emailService.sendPasswordSetup(
    user.email,
    user.name,
    `Temporary password: ${tempPassword} (sign in and there is no in-app change-password flow yet — treat this as the login password)`
  );

  // Passwords are never stored anywhere in plaintext (only as the bcrypt hash
  // above) or retrievable later, so this is the one moment the admin can see
  // it — echoed back here (in addition to the email stub) so provisioning
  // doesn't depend on someone having server console access.
  res.status(201).json({ ...user, tempPassword });
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.nativeEnum(UserRole).optional(),
  active: z.boolean().optional(),
  departmentId: z.string().min(1).nullable().optional(),
  designation: z.nativeEnum(StaffDesignation).nullable().optional(),
});

router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

  const user = await prisma.user.update({ where: { id: req.params.id }, data: parsed.data, select: userSelect });
  // Deactivating or changing a role must take effect on the next request, not
  // whenever the auth cache happens to expire.
  invalidateUserCache(req.params.id);
  res.json(user);
});

const resetPasswordSchema = z.object({
  // If omitted, a random temporary password is generated (the usual case);
  // an admin can instead set a specific password directly.
  password: z.string().min(8).optional(),
});

// Issues a fresh password when someone loses their original one — there is
// no way to recover the old one since only its bcrypt hash is stored.
router.post("/:id/reset-password", async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

  const tempPassword = parsed.data.password ?? crypto.randomBytes(6).toString("base64url");
  const passwordHash = await hashPassword(tempPassword);
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash } });

  await emailService.sendPasswordSetup(
    user.email,
    user.name,
    `New temporary password: ${tempPassword} (replaces their previous password immediately)`
  );

  res.json({ id: user.id, tempPassword });
});

// A hard delete, distinct from deactivating (which just flips `active` and
// keeps their history intact). Only safe once nothing still references them
// — team memberships cascade away, but a captain/shadow slot, a submitted
// interview score, or a candidate assignment will block it with a clear
// message rather than a raw 500.
router.delete("/:id", async (req: AuthedRequest, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ error: "You can't delete your own account" });
  }
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    invalidateUserCache(req.params.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return res
        .status(409)
        .json({ error: "This user still has related records (team captaincy, interview scores, or candidate assignments) — remove those first" });
    }
    throw err;
  }
});

export default router;
