import { artifacts, claims, encounters, notes, orders, patients, type User } from "./repo";
import { noteText } from "./pipeline";
import type { CodingResult, Patient } from "../types";

export function patientOut(p: Patient) {
  return { id: p.id, mrn: p.mrn, name: p.name, dob: p.dob, sex: p.sex, language: p.language, problems: p.chart.problems, medications: p.chart.medications, allergies: p.chart.allergies };
}

export async function encounterOut(u: User, id: string) {
  const e = await encounters.get(u, id);
  if (!e) throw new Error("Encounter not found");
  const rec = await notes.latest(e.id);
  const coding = await artifacts.get<CodingResult>(e.id, "coding");
  const claim = await claims.get(e.id);
  return {
    id: e.id,
    patientId: e.patientId,
    clinicianId: e.userId,
    status: e.status,
    visitType: e.visitType,
    reason: e.reason,
    scheduledAt: e.scheduledAt,
    signedAt: e.signedAt,
    note: rec ? { version: rec.version, status: rec.status, engine: rec.engine, text: noteText(rec.content), sections: rec.content.sections.map((s) => ({ key: s.key, title: s.title, sentences: s.sentences.filter((x) => !x.pending).map((x) => ({ text: x.text, evidence: x.evidence, support: x.support })) })) } : null,
    codes: coding ? { em: coding.em.code, diagnoses: coding.diagnoses.map((d) => ({ code: d.code, label: d.label })), hcc: coding.hcc.map((h) => h.code) } : null,
    orders: (await orders.list(e.id)).map((o) => ({ kind: o.kind, name: o.name, detail: o.detail, status: o.status })),
    claim: claim ? { status: claim.status, charges: claim.content.totals.charges, lines: claim.content.lines.map((l) => ({ cpt: l.cpt, modifiers: l.modifiers, units: l.units })) } : null,
  };
}

export { patients };
