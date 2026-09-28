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
  if (b.prefs?.autoDocuments) b.prefs.autoDocuments = b.prefs.autoDocuments.filter((t) => ["patient_letter", "work_note", "school_note"].includes(t));
  if (b.prefs?.noteDetail && !["concise", "standard", "detailed"].includes(b.prefs.noteDetail)) return fail("Unknown note length");
  const prefs = b.prefs ? { ...b.prefs, audioRetentionDays: b.prefs.audioRetentionDays !== undefined ? Math.max(0, Math.min(365, Math.round(Number(b.prefs.audioRetentionDays) || 0))) : undefined } : undefined;
  const next = await users.update(u.id, { name: b.name?.trim() || undefined, specialty: b.specialty?.trim() || undefined, prefs });
  return json({ user: publicUser({ ...u, ...next! }) });
}
