import { createHash } from "node:crypto";
import { all, get, now, run, uid } from "../db";
import { diffNotes } from "../engine/diff";
import { extractFacts } from "../engine/extract";
import { Forbidden, Invalid } from "./policy";
import { audit, encounters, j, notes, orgs, patients, revisions, utterances, type User } from "./repo";

export interface QaPolicy {
  samplePct: number;
  newUserDays: number;
}

export const RUBRIC = [
  { key: "accuracy", label: "Accuracy", help: "Everything in the note happened in the visit or is in the chart" },
  { key: "completeness", label: "Completeness", help: "Nothing clinically important from the visit is missing" },
  { key: "attribution", label: "Attribution", help: "Statements are attributed to the right speaker" },
  { key: "medications", label: "Medications", help: "Names, doses, frequencies, and changes are correct" },
  { key: "coding", label: "Coding", help: "Diagnoses and level of service are supported" },
] as const;

const canReview = (u: User) => ["owner", "admin", "viewer"].includes(u.role);

async function policy(orgId: string): Promise<QaPolicy> {
  const o = await orgs.get(orgId);
  const p = (o?.settings as { qa?: Partial<QaPolicy> } | undefined)?.qa ?? {};
  return { samplePct: p.samplePct ?? 5, newUserDays: p.newUserDays ?? 14 };
}

export async function setPolicy(u: User, p: Partial<QaPolicy>) {
  if (!["owner", "admin"].includes(u.role)) throw new Forbidden("Only owners and admins can change the review policy");
  const samplePct = p.samplePct === undefined ? undefined : Math.max(0, Math.min(100, Math.round(p.samplePct)));
  const newUserDays = p.newUserDays === undefined ? undefined : Math.max(0, Math.min(90, Math.round(p.newUserDays)));
  const o = (await orgs.get(u.orgId))!;
  const cur = await policy(u.orgId);
  const next = { samplePct: samplePct ?? cur.samplePct, newUserDays: newUserDays ?? cur.newUserDays };
  await orgs.update(u.orgId, { settings: { ...o.settings, qa: next } as typeof o.settings });
  await audit.log(u, null, "qa.policy_updated", next);
  return next;
}

export async function maybeSample(orgId: string, encId: string, clinicianId: string) {
  const p = await policy(orgId);
  const joined = await get<{ created_at: string }>("SELECT created_at FROM memberships WHERE org_id = ? AND user_id = ?", orgId, clinicianId);
  const isNew = joined && Date.now() - new Date(joined.created_at).getTime() < p.newUserDays * 86400000;
  const bucket = parseInt(createHash("sha256").update(encId).digest("hex").slice(0, 8), 16) % 100;
  const reason = isNew ? "new user" : bucket < p.samplePct ? "random sample" : null;
  if (!reason) return null;
  if (await get<{ id: string }>("SELECT id FROM qa_reviews WHERE encounter_id = ?", encId)) return null;
  const id = uid("qa_");
  await run("INSERT INTO qa_reviews (id, org_id, encounter_id, clinician_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)", id, orgId, encId, clinicianId, reason, now());
  return id;
}

export async function queueReview(u: User, encId: string) {
  if (!canReview(u)) throw new Forbidden("Your role can't review notes");
  const e = await encounters.get(u, encId);
  if (!e || e.status !== "signed") throw new Invalid("Only signed notes can be reviewed");
  if (await get<{ id: string }>("SELECT id FROM qa_reviews WHERE encounter_id = ?", encId)) throw new Invalid("This note is already in the review queue");
  const id = uid("qa_");
  await run("INSERT INTO qa_reviews (id, org_id, encounter_id, clinician_id, reason, status, created_at) VALUES (?, ?, ?, ?, 'requested', 'open', ?)", id, u.orgId, encId, e.userId, now());
  return id;
}

interface ReviewRow {
  id: string;
  encounter_id: string;
  clinician_id: string;
  clinician_name: string | null;
  reviewer_name: string | null;
  reason: string;
  status: string;
  scores: string | null;
  comment: string | null;
  created_at: string;
  completed_at: string | null;
}

const SELECT = "SELECT q.*, c.name AS clinician_name, r.name AS reviewer_name FROM qa_reviews q LEFT JOIN users c ON c.id = q.clinician_id LEFT JOIN users r ON r.id = q.reviewer_id";

const toReview = (r: ReviewRow) => ({ id: r.id, encounterId: r.encounter_id, clinicianId: r.clinician_id, clinicianName: r.clinician_name, reviewerName: r.reviewer_name, reason: r.reason, status: r.status as "open" | "done", scores: j<Record<string, number> | null>(r.scores, null), comment: r.comment, createdAt: r.created_at, completedAt: r.completed_at });

export async function reviews(u: User) {
  const rows = (await all<ReviewRow>(`${SELECT} WHERE q.org_id = ? ${canReview(u) ? "" : "AND q.clinician_id = ?"} ORDER BY q.status DESC, q.created_at DESC`, ...(canReview(u) ? [u.orgId] : [u.orgId, u.id]))).map(toReview);
  return rows;
}

export async function reviewDetail(u: User, id: string) {
  const r = await get<ReviewRow>(`${SELECT} WHERE q.org_id = ? AND q.id = ?`, u.orgId, id);
  if (!r) throw new Error("Review not found");
  if (!canReview(u) && r.clinician_id !== u.id) throw new Forbidden("You can only see reviews of your own notes");
  const e = await encounters.byIdUnscoped(r.encounter_id);
  const rec = await notes.latest(r.encounter_id);
  const revs = await revisions.list(r.encounter_id);
  const first = revs.find((x) => x.source.startsWith("ai:"));
  return { review: toReview(r), encounter: e ? { id: e.id, reason: e.reason, scheduledAt: e.scheduledAt, signedAt: e.signedAt } : null, note: rec?.content ?? null, transcript: (await utterances.list(r.encounter_id)).map((x) => ({ id: x.id, speaker: x.speaker, text: x.text })), changes: first && rec ? diffNotes(first.content, rec.content) : [] };
}

export async function submitReview(u: User, id: string, input: { scores?: Record<string, number>; comment?: string }) {
  if (!canReview(u)) throw new Forbidden("Your role can't review notes");
  const r = await get<ReviewRow>(`${SELECT} WHERE q.org_id = ? AND q.id = ?`, u.orgId, id);
  if (!r) throw new Error("Review not found");
  const others = await get<{ n: number }>("SELECT COUNT(*) AS n FROM memberships WHERE org_id = ? AND status = 'active' AND role IN ('owner', 'admin', 'viewer') AND user_id <> ?", u.orgId, u.id);
  if (r.clinician_id === u.id && Number(others?.n ?? 0) > 0) throw new Forbidden("Another reviewer should review your own note");
  const scores: Record<string, number> = {};
  for (const k of RUBRIC.map((x) => x.key)) {
    const v = Number(input.scores?.[k]);
    if (!Number.isInteger(v) || v < 1 || v > 5) throw new Invalid(`Score ${k} from 1 to 5`);
    scores[k] = v;
  }
  await run("UPDATE qa_reviews SET status = 'done', reviewer_id = ?, scores = ?, comment = ?, completed_at = ? WHERE id = ?", u.id, JSON.stringify(scores), (input.comment ?? "").slice(0, 2000), now(), id);
  await audit.log(u, r.encounter_id, "qa.reviewed", { id, ...scores });
}

export async function trustMetrics(u: User, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const signed = await all<{ id: string; user_id: string; name: string }>("SELECT e.id, e.user_id, us.name FROM encounters e JOIN users us ON us.id = e.user_id WHERE e.org_id = ? AND e.status = 'signed' AND e.signed_at >= ?", u.orgId, since);
  const byClin = new Map<string, { name: string; notes: number; edited: number; editLines: number; sections: Map<string, number> }>();
  const sectionTotals = new Map<string, number>();
  for (const e of signed) {
    const revs = await revisions.list(e.id);
    const first = revs.find((x) => x.source.startsWith("ai:"));
    const last = revs.at(-1);
    const c = byClin.get(e.user_id) ?? { name: e.name, notes: 0, edited: 0, editLines: 0, sections: new Map() };
    c.notes++;
    if (first && last) {
      const d = diffNotes(first.content, last.content).filter((x) => !x.key.startsWith("__"));
      if (d.length) c.edited++;
      for (const s of d) {
        c.editLines += s.added.length + s.removed.length;
        c.sections.set(s.title, (c.sections.get(s.title) ?? 0) + 1);
        sectionTotals.set(s.title, (sectionTotals.get(s.title) ?? 0) + 1);
      }
    }
    byClin.set(e.user_id, c);
  }
  const fb = await all<{ section: string; rating: number }>("SELECT f.section, f.rating FROM feedback f JOIN encounters e ON e.id = f.encounter_id WHERE e.org_id = ? AND f.created_at >= ?", u.orgId, since);
  const down = new Map<string, { up: number; down: number }>();
  for (const f of fb) {
    const x = down.get(f.section) ?? { up: 0, down: 0 };
    if (f.rating > 0) x.up++;
    else x.down++;
    down.set(f.section, x);
  }
  const done = (await reviews(u)).filter((r) => r.status === "done" && r.scores);
  const avg = (k: string) => (done.length ? Math.round((done.reduce((n, r) => n + (r.scores![k] ?? 0), 0) / done.length) * 10) / 10 : null);
  return {
    clinicians: [...byClin.entries()].map(([id, c]) => ({ id, name: c.name, notes: c.notes, uneditedRate: c.notes ? Math.round(((c.notes - c.edited) / c.notes) * 100) : null, editsPer100: c.notes ? Math.round((c.editLines / c.notes) * 100) : null, topSection: [...c.sections.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null })),
    sections: [...sectionTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([title, count]) => ({ title, count })),
    feedback: [...down.entries()].map(([section, v]) => ({ section, up: v.up, down: v.down })),
    rubric: RUBRIC.map((r) => ({ key: r.key, label: r.label, average: avg(r.key) })),
    reviewed: done.length,
  };
}

export interface GoldenCase {
  id: string;
  name: string;
  expected: { problems: string[]; meds: string[]; orders: string[] };
  createdAt: string;
  lastRun: { at: string; passed: boolean; missing: string[]; extra: string[] } | null;
}

function signature(f: ReturnType<typeof extractFacts>) {
  return {
    problems: f.problems.filter((p) => !p.fromSymptom).map((p) => p.icd10).sort(),
    meds: f.meds.filter((m) => !m.cancelled && ["start", "stop", "increase", "decrease", "change"].includes(m.action)).map((m) => `${m.action}:${m.name}${m.dose ? `:${m.dose}` : ""}`).sort(),
    orders: f.orders.map((o) => o.name).sort(),
  };
}

export async function saveGolden(u: User, encId: string, name: string) {
  if (!["owner", "admin"].includes(u.role)) throw new Forbidden("Only owners and admins can manage test cases");
  const e = await encounters.get(u, encId);
  if (!e) throw new Error("Encounter not found");
  const p = e.patientId ? await patients.get(u, e.patientId) : undefined;
  const utts = await utterances.list(e.id);
  if (!utts.length) throw new Invalid("This visit has no transcript");
  const expected = signature(extractFacts(utts, p?.chart, { pronouns: p?.pronouns, sex: p?.sex }));
  const id = uid("gc_");
  await run("INSERT INTO golden_cases (id, org_id, name, transcript, chart, expected, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id, u.orgId, name.trim().slice(0, 80) || e.reason || "Test case", JSON.stringify(utts), JSON.stringify(p?.chart ?? null), JSON.stringify(expected), now());
  await audit.log(u, e.id, "qa.golden_saved", { id });
  return id;
}

export async function goldenCases(u: User): Promise<GoldenCase[]> {
  return (await all<{ id: string; name: string; expected: string; created_at: string; last_run: string | null }>("SELECT id, name, expected, created_at, last_run FROM golden_cases WHERE org_id = ? ORDER BY created_at", u.orgId)).map((r) => ({ id: r.id, name: r.name, expected: j(r.expected, { problems: [], meds: [], orders: [] }), createdAt: r.created_at, lastRun: j(r.last_run, null) }));
}

export async function runGolden(u: User) {
  const rows = await all<{ id: string; transcript: string; chart: string; expected: string }>("SELECT id, transcript, chart, expected FROM golden_cases WHERE org_id = ?", u.orgId);
  let passed = 0;
  for (const r of rows) {
    const got = signature(extractFacts(j(r.transcript, []), j(r.chart, undefined) ?? undefined, {}));
    const exp = j<ReturnType<typeof signature>>(r.expected, { problems: [], meds: [], orders: [] });
    const flat = (s: ReturnType<typeof signature>) => [...s.problems.map((x) => `dx ${x}`), ...s.meds.map((x) => `med ${x}`), ...s.orders.map((x) => `order ${x}`)];
    const missing = flat(exp).filter((x) => !flat(got).includes(x));
    const extra = flat(got).filter((x) => !flat(exp).includes(x));
    const ok = !missing.length && !extra.length;
    if (ok) passed++;
    await run("UPDATE golden_cases SET last_run = ? WHERE id = ?", JSON.stringify({ at: now(), passed: ok, missing, extra }), r.id);
  }
  await audit.log(u, null, "qa.golden_run", { total: rows.length, passed });
  return { total: rows.length, passed };
}
