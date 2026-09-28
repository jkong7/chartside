import { all, get, now, run, uid } from "../db";
import { Invalid } from "./policy";
import { audit, users, type User } from "./repo";

export const SURVEY_AFTER_NOTES = 10;
const REPEAT_DAYS = 90;

export async function surveyDue(u: User, at = new Date()) {
  if (!["owner", "admin", "clinician"].includes(u.role)) return false;
  if (u.prefs.surveySnoozedUntil && u.prefs.surveySnoozedUntil > at.toISOString()) return false;
  const since = new Date(at.getTime() - REPEAT_DAYS * 86400000).toISOString();
  if (await get<{ id: string }>("SELECT id FROM surveys WHERE user_id = ? AND org_id = ? AND created_at >= ? LIMIT 1", u.id, u.orgId, since)) return false;
  const n = await get<{ n: number }>("SELECT COUNT(*) AS n FROM encounters WHERE user_id = ? AND org_id = ? AND status = 'signed'", u.id, u.orgId);
  return Number(n?.n ?? 0) >= SURVEY_AFTER_NOTES;
}

export async function submitSurvey(u: User, input: { score?: number; comment?: string }) {
  const score = Number(input.score);
  if (!Number.isInteger(score) || score < 0 || score > 10) throw new Invalid("Choose a score from 0 to 10");
  await run("INSERT INTO surveys (id, org_id, user_id, score, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)", uid("srv_"), u.orgId, u.id, score, (input.comment ?? "").trim().slice(0, 1000), now());
  await audit.log(u, null, "survey.submitted", { score });
}

export async function snoozeSurvey(u: User, days = 7) {
  await users.update(u.id, { prefs: { surveySnoozedUntil: new Date(Date.now() + days * 86400000).toISOString() } });
}

export async function npsFor(orgId: string, days = 90) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = await all<{ score: number; comment: string; created_at: string; name: string }>("SELECT s.score, s.comment, s.created_at, u.name FROM surveys s JOIN users u ON u.id = s.user_id WHERE s.org_id = ? AND s.created_at >= ? ORDER BY s.created_at DESC", orgId, since);
  const promoters = rows.filter((r) => r.score >= 9).length;
  const detractors = rows.filter((r) => r.score <= 6).length;
  return {
    responses: rows.length,
    nps: rows.length ? Math.round(((promoters - detractors) / rows.length) * 100) : null,
    promoters,
    passives: rows.length - promoters - detractors,
    detractors,
    comments: rows.filter((r) => r.comment).slice(0, 8).map((r) => ({ score: Number(r.score), comment: r.comment, name: r.name, at: r.created_at })),
  };
}

export interface Nudge {
  name: string;
  kind: "low_ambient" | "after_hours" | "backlog";
  detail: string;
  tip: string;
}

export function nudgesFrom(clinicians: { name: string; visits: number; ambient: number; afterHours: number; signed: number; backlog: number }[]): Nudge[] {
  const out: Nudge[] = [];
  for (const c of clinicians) {
    const rate = c.visits ? Math.round((c.ambient / c.visits) * 100) : 0;
    if (c.visits >= 3 && rate < 50) out.push({ name: c.name, kind: "low_ambient", detail: `Ambient capture in ${rate}% of ${c.visits} visits`, tip: "Start recording at the door and use Pause instead of stopping. Most clinicians who stay above 70% say setup took under two minutes." });
    if (c.signed >= 3 && c.afterHours / c.signed > 0.3) out.push({ name: c.name, kind: "after_hours", detail: `${Math.round((c.afterHours / c.signed) * 100)}% of notes signed after 7 pm or on weekends`, tip: "Try Brief detail and review each note before the next patient. The draft is ready about a minute after the visit ends." });
    if (c.backlog >= 3) out.push({ name: c.name, kind: "backlog", detail: `${c.backlog} notes drafted more than a day ago and still unsigned`, tip: "The Inbox lists unsigned notes oldest first. Signing the same day keeps claims moving." });
  }
  return out;
}

export async function adoptionNudges(orgId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const rows = await all<{ user_id: string; name: string; status: string; signed_at: string | null; ended_at: string | null; captured: number }>(
    "SELECT e.user_id, u.name, e.status, e.signed_at, e.ended_at, (SELECT COUNT(*) FROM utterances ut WHERE ut.encounter_id = e.id AND ut.source <> 'typed') AS captured FROM encounters e JOIN users u ON u.id = e.user_id WHERE e.org_id = ? AND e.scheduled_at >= ? AND e.scheduled_at <= ? AND e.patient_id IS NOT NULL",
    orgId, since, now(),
  );
  const by = new Map<string, { name: string; visits: number; ambient: number; afterHours: number; signed: number; backlog: number }>();
  for (const r of rows) {
    const c = by.get(r.user_id) ?? { name: r.name, visits: 0, ambient: 0, afterHours: 0, signed: 0, backlog: 0 };
    c.visits++;
    if (Number(r.captured) > 0) c.ambient++;
    if (r.signed_at) {
      c.signed++;
      const d = new Date(r.signed_at);
      if (d.getHours() >= 19 || d.getHours() < 7 || d.getDay() === 0 || d.getDay() === 6) c.afterHours++;
    } else if (r.status === "review" && r.ended_at && r.ended_at < dayAgo) c.backlog++;
    by.set(r.user_id, c);
  }
  return nudgesFrom([...by.values()]);
}
