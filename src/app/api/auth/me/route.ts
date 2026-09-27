import { currentUser, publicUser } from "@/lib/server/auth";
import { body, fail, json } from "@/lib/server/http";
import { users, type UserPrefs } from "@/lib/server/repo";

export async function GET() {
  const u = await currentUser();
  if (!u) return fail("Not signed in", 401);
  return json({ user: publicUser(u) });
}

export async function PATCH(req: Request) {
  const u = await currentUser();
  if (!u) return fail("Not signed in", 401);
  const b = await body<{ name?: string; specialty?: string; prefs?: UserPrefs }>(req);
  const prefs = b.prefs ? { ...b.prefs, audioRetentionDays: b.prefs.audioRetentionDays !== undefined ? Math.max(0, Math.min(365, Math.round(Number(b.prefs.audioRetentionDays) || 0))) : undefined } : undefined;
  const next = await users.update(u.id, { name: b.name?.trim() || undefined, specialty: b.specialty?.trim() || undefined, prefs });
  return json({ user: publicUser({ ...u, ...next! }) });
}
