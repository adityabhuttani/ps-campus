import { UserRole } from "@prisma/client";
import { prisma } from "./prisma";
import { roleAtLeast } from "./auth";

export const DRIVE_LOCKED_MESSAGE =
  "This drive has been concluded — scores and remarks are now read-only";

// Once a drive is concluded, its results are the record of what happened, so
// panelists lose write access to everything under it: scores, remarks, the
// background fields, and the final call.
//
// Captains and admins deliberately keep write access — correcting a mis-keyed
// score after the round table is a real need, and they're the ones accountable
// for the final numbers. Previously this was only enforced by the UI hiding
// controls, which meant a stale browser tab could still write to a concluded
// drive; this makes it a real server-side rule.
//
// Returns an error message when the write should be refused, or null to allow.
export async function driveWriteBlockedFor(driveId: string, role: UserRole): Promise<string | null> {
  if (roleAtLeast(role, UserRole.CAPTAIN)) return null;
  const drive = await prisma.drive.findUnique({ where: { id: driveId }, select: { status: true } });
  return drive?.status === "FINALIZED" ? DRIVE_LOCKED_MESSAGE : null;
}
