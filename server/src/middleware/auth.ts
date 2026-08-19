import { Request, Response, NextFunction } from "express";
import { UserRole } from "@prisma/client";
import { AUTH_COOKIE, roleAtLeast, verifyToken } from "../lib/auth";
import { prisma } from "../lib/prisma";

export interface AuthedRequest extends Request {
  user?: { id: string; role: UserRole; name: string; email: string };
}

type CachedUser = { id: string; role: UserRole; name: string; email: string; active: boolean };

// Verifying the JWT is free, but the DB lookup that follows it is not: against
// the hosted database every round trip costs ~850ms, and this ran on *every*
// authenticated request before the route did any work of its own — so it was
// the single biggest source of the app feeling slow.
//
// The lookup exists to catch a user deactivated (or demoted) since their token
// was issued, which is worth keeping, so it's cached briefly rather than
// dropped. Any change to a user invalidates their entry immediately via
// invalidateUserCache(), so in practice deactivation still takes effect at
// once; the TTL is only a backstop for changes made outside the app.
const USER_CACHE_TTL_MS = 30_000;
const userCache = new Map<string, { user: CachedUser; expiresAt: number }>();

export function invalidateUserCache(userId: string) {
  userCache.delete(userId);
}

async function loadUser(userId: string): Promise<CachedUser | null> {
  const cached = userCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.user;

  const found = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, name: true, email: true, active: true },
  });
  if (!found) {
    userCache.delete(userId);
    return null;
  }
  userCache.set(userId, { user: found, expiresAt: Date.now() + USER_CACHE_TTL_MS });
  return found;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const payload = verifyToken(token);
    const user = await loadUser(payload.userId);
    if (!user || !user.active) return res.status(401).json({ error: "Not authenticated" });
    req.user = { id: user.id, role: user.role, name: user.name, email: user.email };
    next();
  } catch {
    return res.status(401).json({ error: "Not authenticated" });
  }
}

export function requireRole(minRole: UserRole) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roleAtLeast(req.user.role, minRole)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
