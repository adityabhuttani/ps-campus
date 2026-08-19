import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AUTH_COOKIE, comparePassword, signToken } from "../lib/auth";
import { AuthedRequest, requireAuth } from "../middleware/auth";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const isProd = process.env.NODE_ENV === "production";

// The client and server are served from the same origin in production (see
// app.ts), so this is "none" purely for robustness — e.g. if they're ever
// split across two hosts again — rather than something today's setup relies
// on. "lax" in dev matches how the two local dev servers are actually split
// across ports. A cookie marked "none" must also be "secure", which is only
// safe to set once we're actually behind HTTPS (i.e. in production).
const cookieOptions = {
  httpOnly: true,
  sameSite: (isProd ? "none" : "lax") as "none" | "lax",
  secure: isProd,
};

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.active) return res.status(401).json({ error: "Invalid email or password" });

  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });

  const token = signToken({ userId: user.id, role: user.role });
  res.cookie(AUTH_COOKIE, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

router.post("/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE, cookieOptions);
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  res.json(req.user);
});

export default router;
