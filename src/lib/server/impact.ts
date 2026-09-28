import { all } from "../db";
import type { MeasureResult } from "../engine/quality";
import { j, type User } from "./repo";
import { adoptionNudges, npsFor } from "./survey";

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const afterHours = (d: Date) => d.getHours() >= 19 || d.getHours() < 7 || d.getDay() === 0 || d.getDay() === 6;

function weekStart(iso: string) {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

export async function impact(u: User, opts: { days?: number; baselineMinutes?: number } = {}) {
  const days = opts.days ?? 30;
  const baseline = opts.baselineMinutes ?? 7;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const encs = await all<{ id: string; user_id: string; name: string; scheduled_at: string; status: string; signed_at: string | null; ended_at: string | null; captured: number; location: string | null }>(
    "SELECT e.id, e.user_id, us.name, e.scheduled_at, e.status, e.signed_at, e.ended_at, (SELECT COUNT(*) FROM utterances ut WHERE ut.encounter_id = e.id AND ut.source <> 'typed') AS captured, l.name AS location FROM encounters e JOIN users us ON us.id = e.user_id LEFT JOIN locations l ON l.id = e.location_id WHERE e.org_id = ? AND e.scheduled_at >= ? AND e.scheduled_at <= ?",
    u.orgId, since, new Date().toISOString(),
  );
  const gen = new Map((await all<{ encounter_id: string; created_at: string }>("SELECT a.encounter_id, MAX(a.created_at) AS created_at FROM audit a WHERE a.org_id = ? AND a.action = 'note.generated' AND a.created_at >= ? GROUP BY a.encounter_id", u.orgId, since)).map((r) => [r.encounter_id, r.created_at]));
  const signed = encs.filter((e) => e.signed_at);
  const review = signed.map((e) => (gen.has(e.id) ? (new Date(e.signed_at!).getTime() - new Date(gen.get(e.id)!).getTime()) / 60000 : null)).filter((m): m is number => m !== null && m >= 0);
  const savedMinutes = review.reduce((n, m) => n + (baseline - Math.min(m, baseline)), 0);
  const weeks = new Map<string, { visits: number; ambient: number; signed: number; late: number }>();
  for (const e of encs) {
    const w = weekStart(e.scheduled_at);
    const x = weeks.get(w) ?? { visits: 0, ambient: 0, signed: 0, late: 0 };
    x.visits++;
    if (e.captured > 0) x.ambient++;
    if (e.signed_at) {
      x.signed++;
      if (afterHours(new Date(e.signed_at))) x.late++;
    }
    weeks.set(w, x);
  }
  const clinicians = new Map<string, { name: string; visits: number; ambient: number }>();
  for (const e of encs) {
    const c = clinicians.get(e.user_id) ?? { name: e.name, visits: 0, ambient: 0 };
    c.visits++;
    if (e.captured > 0) c.ambient++;
    clinicians.set(e.user_id, c);
  }
  const claims = await all<{ content: string; status: string }>("SELECT c.content, c.status FROM claims c JOIN encounters e ON e.id = c.encounter_id WHERE e.org_id = ? AND c.updated_at >= ?", u.orgId, since);
  const lines = claims.flatMap((c) => j<{ claim: { lines: { cpt: string; source: string; charge: number }[] } }>(c.content, { claim: { lines: [] } }).claim?.lines ?? []);
  const emMix = new Map<string, number>();
  for (const l of lines.filter((x) => x.source === "em")) emMix.set(l.cpt, (emMix.get(l.cpt) ?? 0) + 1);
  const addOns = lines.filter((l) => l.source === "addon");
  const history = claims.map((c) => j<{ history: { action: string }[] }>(c.content, { history: [] }).history ?? []);
  const submitted = history.filter((h) => h.some((x) => /accepted|rejected|submit/i.test(x.action))).length;
  const firstPass = history.filter((h) => h.some((x) => /accepted/i.test(x.action)) && !h.some((x) => /rejected|denied/i.test(x.action))).length;
  const quality = await all<{ content: string }>("SELECT a.content FROM artifacts a JOIN encounters e ON e.id = a.encounter_id WHERE e.org_id = ? AND a.kind = 'quality' AND e.scheduled_at >= ?", u.orgId, since);
  const measures = quality.flatMap((q) => j<MeasureResult[]>(q.content, []));
  const msgs = await all<{ received_at: string; replied_at: string | null }>("SELECT received_at, replied_at FROM messages WHERE org_id = ? AND received_at >= ?", u.orgId, since);
  const replyHours = msgs.filter((m) => m.replied_at).map((m) => (new Date(m.replied_at!).getTime() - new Date(m.received_at).getTime()) / 3600000);
  return {
    days,
    baselineMinutes: baseline,
    adoption: {
      clinicians: clinicians.size,
      visits: encs.length,
      ambientRate: encs.length ? Math.round((encs.filter((e) => e.captured > 0).length / encs.length) * 100) : null,
      byLocation: Object.entries(encs.reduce<Record<string, { visits: number; ambient: number; signed: number }>>((acc, e) => { const k = e.location ?? "Unassigned"; acc[k] ??= { visits: 0, ambient: 0, signed: 0 }; acc[k].visits++; if (Number(e.captured) > 0) acc[k].ambient++; if (e.signed_at) acc[k].signed++; return acc; }, {})).map(([name, x]) => ({ name, ...x, rate: x.visits ? Math.round((x.ambient / x.visits) * 100) : 0 })).sort((a, b) => b.visits - a.visits),
      byClinician: [...clinicians.values()].map((c) => ({ ...c, rate: c.visits ? Math.round((c.ambient / c.visits) * 100) : 0 })).sort((a, b) => b.visits - a.visits),
    },
    time: {
      signed: signed.length,
      medianReviewMinutes: median(review) === null ? null : Math.round(median(review)! * 10) / 10,
      hoursSaved: Math.round((savedMinutes / 60) * 10) / 10,
      afterHoursRate: signed.length ? Math.round((signed.filter((e) => afterHours(new Date(e.signed_at!))).length / signed.length) * 100) : null,
      sameDayRate: signed.length ? Math.round((signed.filter((e) => new Date(e.signed_at!).toDateString() === new Date(e.scheduled_at).toDateString()).length / signed.length) * 100) : null,
    },
    revenue: {
      claims: claims.length,
      addOnLines: addOns.length,
      addOnCharges: Math.round(addOns.reduce((n, l) => n + l.charge, 0) * 100) / 100,
      firstPassRate: submitted ? Math.round((firstPass / submitted) * 100) : null,
      emMix: [...emMix.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, count]) => ({ code, count })),
    },
    quality: { evaluated: measures.filter((m) => m.status !== "excluded").length, addressed: measures.filter((m) => m.status === "addressed").length, open: measures.filter((m) => m.status === "gap").length },
    messages: { received: msgs.length, replied: replyHours.length, medianReplyHours: median(replyHours) === null ? null : Math.round(median(replyHours)! * 10) / 10 },
    satisfaction: await npsFor(u.orgId, Math.max(days, 90)),
    nudges: await adoptionNudges(u.orgId, days),
    weeks: [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, x]) => ({ week, ...x })),
  };
}
