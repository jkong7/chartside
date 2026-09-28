import { evaluateQuality, MEASURES, qualitySummary, type MeasureResult } from "../engine/quality";
import type { Encounter } from "../types";
import { factsFor } from "./pipeline";
import { artifacts, encounters, notes, orders, patients, utterances, type User } from "./repo";

export async function qualityFor(user: User, enc: Encounter, opts: { save?: boolean } = {}) {
  const patient = enc.patientId ? await patients.get(user, enc.patientId) : undefined;
  if (!patient) return null;
  const utts = await utterances.list(enc.id);
  const facts = utts.length ? (await factsFor(user, enc)).facts : null;
  const rec = await notes.latest(enc.id);
  const noteLines = (rec?.content.sections ?? []).flatMap((s) => s.sentences.filter((x) => !x.pending).map((x) => x.text));
  const results = evaluateQuality({ patient, facts, utterances: utts, orders: await orders.list(enc.id), at: new Date(enc.scheduledAt), noteLines });
  if (opts.save !== false && utts.length) await artifacts.set(enc.id, "quality", results);
  return results;
}

export async function qualityDashboard(user: User) {
  const since = new Date(Date.now() - 365 * 86400000).toISOString();
  const list = (await encounters.list(user, { from: since, statuses: ["signed"] })).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  const latest = new Map<string, (typeof list)[number]>();
  for (const e of list) if (e.patientId && !latest.has(e.patientId)) latest.set(e.patientId, e);
  const rows = new Map<string, { met: number; addressed: number; gap: number; excluded: number; byClinician: Map<string, { name: string; met: number; eligible: number }> }>();
  const gaps: { encounterId: string; patientId: string; patientName: string; measure: string; reason: string; clinician: string }[] = [];
  for (const e of latest.values()) {
    const q = await artifacts.get<MeasureResult[]>(e.id, "quality");
    if (!q) continue;
    const p = await patients.get(user, e.patientId!);
    for (const r of q) {
      const row = rows.get(r.id) ?? { met: 0, addressed: 0, gap: 0, excluded: 0, byClinician: new Map() };
      row[r.status]++;
      if (r.status !== "excluded") {
        const c = row.byClinician.get(e.userId) ?? { name: e.clinicianName ?? "Clinician", met: 0, eligible: 0 };
        c.eligible++;
        if (r.inverse ? r.status !== "gap" : r.status === "met") c.met++;
        row.byClinician.set(e.userId, c);
      }
      rows.set(r.id, row);
      if (r.status === "gap") gaps.push({ encounterId: e.id, patientId: e.patientId!, patientName: p?.name ?? "Patient", measure: r.title, reason: r.reason, clinician: e.clinicianName ?? "" });
    }
  }
  return {
    measures: MEASURES.map((m) => {
      const r = rows.get(m.id);
      const eligible = r ? r.met + r.addressed + r.gap : 0;
      const performing = r ? (m.inverse ? r.met + r.addressed : r.met) : 0;
      return { ...m, eligible, met: r?.met ?? 0, addressed: r?.addressed ?? 0, gap: r?.gap ?? 0, excluded: r?.excluded ?? 0, rate: eligible ? Math.round((performing / eligible) * 100) : null, clinicians: r ? [...r.byClinician.values()].map((c) => ({ ...c, rate: c.eligible ? Math.round((c.met / c.eligible) * 100) : null })) : [] };
    }),
    gaps,
    patients: latest.size,
  };
}

export { qualitySummary };
