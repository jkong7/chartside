import { validateClaim, claimStatus, type Claim, type ClaimLine } from "../engine/billing";
import type { PaPacket } from "../engine/priorauth";
import { ageFrom } from "../engine/text";
import type { CodingResult } from "../types";
import { factsFor } from "./pipeline";
import { artifacts, claims, encounters, patients, users, type ClaimRecord, type User } from "./repo";

export async function revalidate(user: User, encId: string, claim: Claim) {
  const enc = (await encounters.get(user, encId))!;
  const { facts, patient } = await factsFor(user, enc);
  const coding = (await artifacts.get<CodingResult>(enc.id, "coding")) ?? null;
  return validateClaim(claim, facts, coding, {
    age: patient ? ageFrom(patient.dob, new Date(enc.scheduledAt)) : 40,
    sex: patient?.sex ?? "X",
    setting: enc.setting,
    patientType: coding?.em.patientType ?? "established",
    chart: patient?.chart,
    minutes: Math.round(enc.durationS / 60),
  });
}

export function sanitizeLines(lines: Partial<ClaimLine>[]): ClaimLine[] {
  return lines.map((l, i) => ({
    id: String(l.id ?? `ln_m${i}`),
    cpt: String(l.cpt ?? "").trim().toUpperCase().slice(0, 5),
    description: String(l.description ?? l.cpt ?? "").slice(0, 120),
    modifiers: (l.modifiers ?? []).map((m) => String(m).trim().toUpperCase().slice(0, 2)).filter(Boolean).slice(0, 4),
    pointers: (l.pointers ?? []).map((p) => String(p).trim().toUpperCase().slice(0, 1)).filter((p) => /^[A-L]$/.test(p)).slice(0, 4),
    units: Math.max(1, Math.min(99, Math.round(Number(l.units ?? 1)))),
    charge: Math.max(0, Math.round(Number(l.charge ?? 0) * 100) / 100),
    source: (l.source ?? "manual") as ClaimLine["source"],
    rationale: String(l.rationale ?? "Edited by reviewer").slice(0, 200),
    evidence: Array.isArray(l.evidence) ? l.evidence.map(String) : [],
  }));
}

export async function claimAction(user: User, encId: string, action: string, opts: { note?: string; opportunityId?: string }): Promise<ClaimRecord> {
  const rec = await claims.get(encId);
  if (!rec) throw new Error("Claim not found; sign the note first");
  const at = new Date().toISOString();
  const history = [...rec.history];
  let claim = rec.content;
  let status = rec.status;
  if (action === "approve") {
    if (claim.edits.some((e) => e.severity === "error")) throw new Error("Resolve claim errors before approving");
    if (status === "submitted") throw new Error("Claim already submitted");
    status = "approved";
  } else if (action === "hold") {
    if (!opts.note?.trim()) throw new Error("Add a note explaining the hold");
    status = "on_hold";
  } else if (action === "submit") {
    if (status !== "approved") throw new Error("Approve the claim before submitting");
    status = "submitted";
  } else if (action === "reopen") {
    if (status === "submitted") throw new Error("Submitted claims cannot be reopened; file a corrected claim");
    status = claimStatus(claim);
  } else if (action === "add_opportunity") {
    const opp = claim.opportunities.find((o) => o.id === opts.opportunityId);
    if (!opp?.line) throw new Error("That opportunity has no billable line");
    if (status === "submitted") throw new Error("Claim already submitted");
    claim = await revalidate(user, encId, { ...claim, lines: [...claim.lines, opp.line], opportunities: claim.opportunities.filter((o) => o.id !== opp.id) });
    status = claimStatus(claim);
  } else {
    throw new Error("Unknown action");
  }
  history.push({ at, action, note: opts.note?.trim() || undefined, by: user.name });
  const enc = await encounters.byIdUnscoped(encId);
  return claims.save(enc?.userId ?? user.id, encId, status, claim, history, action === "hold" ? opts.note?.trim() : undefined);
}

export async function revenueSummary(user: User) {
  const list = await claims.list(user);
  const rows = [];
  for (const r of list) {
    const enc = await encounters.byIdUnscoped(r.encounterId);
    const p = enc?.patientId ? await patients.get(user, enc.patientId) : undefined;
    const clinician = enc ? await users.byId(enc.userId) : undefined;
    rows.push({
      encounterId: r.encounterId,
      patient: p?.name ?? "Unassigned",
      date: enc?.scheduledAt ?? r.updatedAt,
      status: r.status,
      em: r.content.lines.find((l) => l.source === "em")?.cpt ?? "—",
      dx: r.content.dx.map((d) => d.code),
      charges: r.content.totals.charges,
      errors: r.content.edits.filter((e) => e.severity === "error").length,
      warnings: r.content.edits.filter((e) => e.severity === "warning").length,
      opportunities: r.content.opportunities.length,
      clinician: clinician?.name ?? "",
    });
  }
  const byStatus: Record<string, { count: number; charges: number }> = {};
  for (const r of rows) {
    byStatus[r.status] ??= { count: 0, charges: 0 };
    byStatus[r.status].count++;
    byStatus[r.status].charges = Math.round((byStatus[r.status].charges + r.charges) * 100) / 100;
  }
  const leakage: Record<string, { count: number; value: number; examples: { encounterId: string; patient: string; title: string; value: number }[] }> = {};
  for (const r of list) {
    const row = rows.find((x) => x.encounterId === r.encounterId)!;
    for (const o of r.content.opportunities) {
      leakage[o.category] ??= { count: 0, value: 0, examples: [] };
      leakage[o.category].count++;
      leakage[o.category].value += o.value;
      if (leakage[o.category].examples.length < 5) leakage[o.category].examples.push({ encounterId: r.encounterId, patient: row.patient, title: o.title, value: o.value });
    }
  }
  const pa: (PaPacket & { encounterId: string; patient: string })[] = [];
  for (const e of await encounters.list(user)) {
    const packets = (await artifacts.get<PaPacket[]>(e.id, "priorAuth")) ?? [];
    const p = e.patientId ? await patients.get(user, e.patientId) : undefined;
    for (const x of packets) pa.push({ ...x, encounterId: e.id, patient: p?.name ?? "Unassigned" });
  }
  return { rows, byStatus, leakage, priorAuth: pa, totals: { charges: Math.round(rows.reduce((s, r) => s + r.charges, 0) * 100) / 100, leakageValue: Object.values(leakage).reduce((s, l) => s + l.value, 0) } };
}
