import { get } from "../db";
import { navMode, ownSigned, type NavMode } from "../nav";
import type { User } from "./repo";

export async function signedByMe(u: User) {
  const n = await get<{ n: number }>("SELECT COUNT(*) AS n FROM encounters WHERE user_id = ? AND status = 'signed'", u.id);
  return ownSigned(Number(n?.n ?? 0), u.prefs.demoSigned);
}

export async function navModeFor(u: User): Promise<NavMode> {
  if (u.prefs.simpleNav !== true) return "full";
  const team = await get<{ n: number }>("SELECT COUNT(*) AS n FROM memberships WHERE org_id = ? AND status = 'active'", u.orgId);
  return navMode({ role: u.role, simpleNav: u.prefs.simpleNav, signedByMe: await signedByMe(u), teamSize: Number(team?.n ?? 1) });
}
