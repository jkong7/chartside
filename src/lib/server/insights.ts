import { all } from "../db";
import type { Note } from "../types";

interface Row {
  id: string;
  scheduled_at: string;
  visit_type: string;
  status: string;
  ended_at: string | null;
  signed_at: string | null;
  duration_s: number;
  template_id: string | null;
  engine: string | null;
  content: string | null;
  captured: number;
}

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function afterHours(d: Date) {
  const h = d.getHours();
  const day = d.getDay();
  return h >= 19 || h < 7 || day === 0 || day === 6;
}

export async function computeInsights(userId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = await all<Row>(
    `SELECT e.id, e.scheduled_at, e.visit_type, e.status, e.ended_at, e.signed_at, e.duration_s, e.template_id,
            n.engine, n.content,
            (SELECT COUNT(*) FROM utterances u WHERE u.encounter_id = e.id) AS captured
       FROM encounters e
       LEFT JOIN notes n ON n.encounter_id = e.id AND n.version = (SELECT MAX(version) FROM notes WHERE encounter_id = e.id)
      WHERE e.user_id = ? AND e.scheduled_at >= ?
      ORDER BY e.scheduled_at`,
    userId,
    since,
  );
  const signed = rows.filter((r) => r.signed_at);
  const signAudit = (await all<{ encounter_id: string; detail: string }>("SELECT a.encounter_id, a.detail FROM audit a JOIN encounters e ON e.id = a.encounter_id WHERE e.user_id = ? AND a.action = 'note.signed' AND a.created_at >= ?", userId, since)).map((r) => ({ id: r.encounter_id, ...(JSON.parse(r.detail) as { edited: boolean; editRatio: number }) }));
  const genAudit = (await all<{ detail: string }>("SELECT a.detail FROM audit a JOIN encounters e ON e.id = a.encounter_id WHERE e.user_id = ? AND a.action = 'note.generated' AND a.created_at >= ?", userId, since)).map((r) => JSON.parse(r.detail) as { supportedPct: number; omissions: number; ms: number; engine: string });

  const signMinutes = signed.filter((r) => r.ended_at).map((r) => (new Date(r.signed_at!).getTime() - new Date(r.ended_at!).getTime()) / 60000).filter((m) => m >= 0);
  const late = signed.filter((r) => afterHours(new Date(r.signed_at!))).length;
  const unedited = signAudit.filter((a) => !a.edited).length;
  const words = signed.reduce((n, r) => {
    if (!r.content) return n;
    const note = JSON.parse(r.content) as Note;
    return n + note.sections.filter((s) => s.key !== "__consent").flatMap((s) => s.sentences).reduce((m, s) => m + s.text.split(/\s+/).length, 0);
  }, 0);

  const byType = new Map<string, { total: number; captured: number }>();
  const past = rows.filter((r) => new Date(r.scheduled_at) < new Date());
  for (const r of past) {
    const t = byType.get(r.visit_type) ?? { total: 0, captured: 0 };
    t.total++;
    if (r.captured > 0) t.captured++;
    byType.set(r.visit_type, t);
  }
  const usage = Array.from(byType.entries()).map(([type, v]) => ({ type, total: v.total, captured: v.captured, pct: v.total ? Math.round((v.captured / v.total) * 100) : 0 }));
  const coach: string[] = [];
  for (const u of usage) if (u.total >= 2 && u.pct < 60) coach.push(`You used ambient capture in ${u.captured} of ${u.total} ${u.type} visits. Try it on your next ${u.type} visit; that's where clinicians see the biggest time savings.`);
  if (late >= 2) coach.push(`${late} notes were signed after hours. Signing before you leave the exam room keeps details fresh and cuts pajama time.`);
  if (signAudit.length >= 3 && unedited / signAudit.length < 0.3) coach.push("Most notes still need edits before signing. Review the style rules Chartside learned, or pick a more concise template.");

  const dayKey = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const series = new Map<string, { date: string; notes: number; signMinutes: number[] }>();
  for (let i = Math.min(days, 14) - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const k = dayKey(d.toISOString());
    series.set(k, { date: k, notes: 0, signMinutes: [] });
  }
  for (const r of signed) {
    const k = dayKey(r.signed_at!);
    const s = series.get(k);
    if (!s) continue;
    s.notes++;
    if (r.ended_at) s.signMinutes.push((new Date(r.signed_at!).getTime() - new Date(r.ended_at).getTime()) / 60000);
  }

  return {
    windowDays: days,
    visits: rows.length,
    signed: signed.length,
    medianSignMinutes: median(signMinutes),
    afterHoursSigned: late,
    uneditedRate: signAudit.length ? Math.round((unedited / signAudit.length) * 100) : null,
    avgEditRatio: signAudit.length ? Math.round((signAudit.reduce((n, a) => n + (a.editRatio ?? 0), 0) / signAudit.length) * 1000) / 10 : null,
    evidencePct: genAudit.length ? Math.round(genAudit.reduce((n, g) => n + (g.supportedPct ?? 0), 0) / genAudit.length) : null,
    omissionsCaught: genAudit.reduce((n, g) => n + (g.omissions ?? 0), 0),
    wordsDrafted: words,
    typingMinutesAvoided: Math.round(words / 40),
    engines: genAudit.reduce<Record<string, number>>((acc, g) => ((acc[g.engine] = (acc[g.engine] ?? 0) + 1), acc), {}),
    usage,
    coach,
    series: Array.from(series.values()).map((s) => ({ date: s.date, notes: s.notes, medianSignMinutes: median(s.signMinutes) })),
  };
}

export type Insights = Awaited<ReturnType<typeof computeInsights>>;

export async function computeOrgAnalytics(orgId: string, days = 30) {
  const members = await all<{ user_id: string; name: string; role: string }>("SELECT m.user_id, u.name, m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND m.status = 'active' AND m.role IN ('owner', 'admin', 'clinician') ORDER BY u.name", orgId);
  const out = [];
  for (const m of members) {
    const i = await computeInsights(m.user_id, days);
    out.push({ userId: m.user_id, name: m.name, role: m.role, visits: i.visits, signed: i.signed, medianSignMinutes: i.medianSignMinutes, uneditedRate: i.uneditedRate, afterHoursSigned: i.afterHoursSigned, evidencePct: i.evidencePct });
  }
  return out;
}
