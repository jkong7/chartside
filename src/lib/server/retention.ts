import { all, now, run } from "../db";
import { Forbidden, Invalid } from "./policy";
import { artifacts, audit, orgs, type User } from "./repo";

export const TRANSCRIPT_DAYS = [0, 7, 30, 90, 365] as const;
export const PURGED_TEXT = "[removed per retention policy]";

export async function orgRetention(orgId: string): Promise<{ transcriptDays: number | null }> {
  const s = (await orgs.get(orgId))?.settings as { retention?: { transcriptDays?: number | null } } | undefined;
  return { transcriptDays: s?.retention?.transcriptDays ?? null };
}

export async function setRetention(u: User, input: { transcriptDays?: number | null }) {
  if (!["owner", "admin"].includes(u.role)) throw new Forbidden("Only admins can change retention");
  const d = input.transcriptDays;
  if (d !== null && d !== undefined && !(TRANSCRIPT_DAYS as readonly number[]).includes(d)) throw new Invalid("Choose 0, 7, 30, 90, or 365 days, or keep transcripts");
  const org = (await orgs.get(u.orgId))!;
  await orgs.update(org.id, { settings: { ...org.settings, retention: { transcriptDays: d ?? null } } as typeof org.settings });
  await audit.log(u, null, "retention.updated", { transcriptDays: d ?? null });
  return purgeTranscripts(u.orgId);
}

export async function purgeTranscripts(orgId: string) {
  const { transcriptDays } = await orgRetention(orgId);
  if (transcriptDays === null) return 0;
  const before = new Date(Date.now() - transcriptDays * 86400000).toISOString();
  const due = await all<{ id: string }>("SELECT e.id FROM encounters e WHERE e.org_id = ? AND e.status = 'signed' AND e.signed_at <= ? AND NOT EXISTS (SELECT 1 FROM artifacts a WHERE a.encounter_id = e.id AND a.kind = 'transcript_purged')", orgId, before);
  for (const e of due) {
    await run("UPDATE utterances SET text = ?, redacted = 1 WHERE encounter_id = ?", PURGED_TEXT, e.id);
    await artifacts.set(e.id, "transcript_purged", { at: now(), days: transcriptDays });
    await audit.log({ id: null, orgId }, e.id, "transcript.purged", { days: transcriptDays });
  }
  return due.length;
}
