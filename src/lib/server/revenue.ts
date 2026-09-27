import { validateClaim, claimStatus, type Claim, type ClaimLine } from "../engine/billing";
import type { PaPacket } from "../engine/priorauth";
import { ageFrom } from "../engine/text";
import type { CodingResult } from "../types";
import { factsFor } from "./pipeline";
import { billingSettings, payerFor, referenceFor } from "./rcm";
import { artifacts, claims, encounters, notes, patients, users, type ClaimLifecycle, type ClaimRecord, type ClaimStatus, type User } from "./repo";
import { buildAppealLetter, denialOf, sandboxClearinghouse, totalsOf, type Remit, type RemitLine } from "../rcm/remit";

export async function revalidate(user: User, encId: string, claim: Claim) {
  const enc = (await encounters.get(user, encId))!;
  const { facts, patient } = await factsFor(user, enc);
  const coding = (await artifacts.get<CodingResult>(enc.id, "coding")) ?? null;
  const age = patient ? ageFrom(patient.dob, new Date(enc.scheduledAt)) : 40;
  return validateClaim(claim, facts, coding, {
    age,
    sex: patient?.sex ?? "X",
    setting: enc.setting,
    patientType: coding?.em.patientType ?? "established",
    chart: patient?.chart,
    minutes: Math.round(enc.durationS / 60),
    payer: claim.payer ?? payerFor(patient, age),
    ref: await referenceFor(enc, user.orgId),
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

const LOCKED: ClaimStatus[] = ["submitted", "accepted", "paid", "partial", "denied", "appealed", "closed"];

function statusFromRemits(remits: Remit[]): ClaimStatus {
  const last = remits.at(-1);
  if (!last) return "accepted";
  const lines = new Map<string, number>();
  for (const r of remits) for (const l of r.lines) lines.set(l.lineId, Math.max(lines.get(l.lineId) ?? 0, l.paid + l.patientResp));
  const vals = [...lines.values()];
  if (vals.every((v) => v > 0)) return "paid";
  if (vals.every((v) => v === 0)) return "denied";
  return "partial";
}

export function balanceOf(rec: Pick<ClaimRecord, "content" | "lifecycle" | "status">) {
  const expected = rec.content.totals.allowed ?? null;
  const paid = Math.round(rec.lifecycle.remits.reduce((s, r) => s + r.totals.paid, 0) * 100) / 100;
  const latest = new Map<string, RemitLine>();
  for (const r of rec.lifecycle.remits) for (const l of r.lines) if (l.paid + l.patientResp > 0 || !latest.has(l.lineId)) latest.set(l.lineId, l);
  const patient = Math.round([...latest.values()].reduce((s, l) => s + l.patientResp, 0) * 100) / 100;
  const deniedOpen = rec.status === "closed" ? 0 : Math.round([...latest.values()].filter((l) => l.paid + l.patientResp === 0).reduce((s, l) => s + l.billed, 0) * 100) / 100;
  const outstanding = ["accepted", "submitted"].includes(rec.status) ? expected ?? rec.content.totals.charges : 0;
  return { expected, paid, patientBalance: patient, deniedOpen, outstanding, writeOff: rec.lifecycle.writeOff ?? 0 };
}

async function noteExcerpt(encId: string) {
  const rec = await notes.latest(encId);
  if (!rec) return [];
  return rec.content.sections.filter((x) => /assessment|plan/i.test(x.title)).flatMap((x) => x.sentences.map((t) => t.text)).slice(0, 8);
}

export async function claimAction(user: User, encId: string, action: string, opts: { note?: string; opportunityId?: string; outcome?: "won" | "lost"; remit?: Partial<Remit> }): Promise<ClaimRecord> {
  const rec = await claims.get(encId);
  if (!rec) throw new Error("Claim not found; sign the note first");
  const at = new Date().toISOString();
  const history = [...rec.history];
  const lifecycle: ClaimLifecycle = { ...rec.lifecycle, remits: [...rec.lifecycle.remits] };
  let claim = rec.content;
  let status = rec.status;
  let note = opts.note?.trim() || undefined;
  const enc = await encounters.byIdUnscoped(encId);
  const settings = await billingSettings(user.orgId);
  const claimId = `CS${encId.replace(/\W/g, "").slice(-10).toUpperCase()}`;
  const ch = sandboxClearinghouse;

  if (action === "approve") {
    if (claim.edits.some((e) => e.severity === "error")) throw new Error("Resolve claim errors before approving");
    if (LOCKED.includes(status)) throw new Error("Claim already submitted");
    status = "approved";
  } else if (action === "hold") {
    if (!note) throw new Error("Add a note explaining the hold");
    if (LOCKED.includes(status)) throw new Error("Claim already submitted");
    status = "on_hold";
  } else if (action === "submit") {
    if (status !== "approved") throw new Error("Approve the claim before submitting");
    const ack = ch.submit(claim, { claimId, npi: settings.npi, tin: settings.tin });
    lifecycle.clearinghouse = ch.name;
    lifecycle.submittedAt = at;
    lifecycle.controlNumber = ack.controlNumber;
    lifecycle.frequency ??= 1;
    if (ack.accepted) {
      status = "accepted";
      lifecycle.acceptedAt = at;
      lifecycle.rejections = [];
      note = `Accepted by ${ch.name} (${ack.controlNumber})`;
    } else {
      status = "rejected";
      lifecycle.rejections = ack.errors;
      note = `Rejected by ${ch.name}: ${ack.errors.join(" ")}`;
    }
  } else if (action === "reopen") {
    if (!["on_hold", "approved", "rejected", "ready", "needs_review"].includes(status)) throw new Error("Only claims that have not been accepted by the payer can be reopened; file a corrected claim instead");
    status = claimStatus(claim);
  } else if (action === "correct") {
    if (!["denied", "partial"].includes(status)) throw new Error("Corrected claims are filed after a denial");
    lifecycle.frequency = 7;
    claim = await revalidate(user, encId, claim);
    status = claimStatus(claim);
    note = note ?? "Corrected claim (frequency code 7) opened for rework";
  } else if (action === "remit") {
    if (!["accepted", "appealed"].includes(status)) throw new Error("Remittance is posted after the payer accepts the claim");
    const r = opts.remit?.lines?.length ? manualRemit(claim, opts.remit, at) : ch.adjudicate(claim, { claimId, at });
    lifecycle.remits.push(r);
    status = statusFromRemits(lifecycle.remits);
    const d = denialOf(r);
    note = `${r.source === "manual" ? "Manual posting" : "ERA"} ${r.payerClaimId}: paid $${r.totals.paid.toFixed(2)}, patient $${r.totals.patientResp.toFixed(2)}${d ? `; denied ${d.lines.join(", ")} (${d.category.replace("_", " ")}, CARC ${d.carcs.join("/")})` : ""}`;
  } else if (action === "appeal") {
    if (!["denied", "partial"].includes(status)) throw new Error("Only denied claims can be appealed");
    const last = lifecycle.remits.at(-1)!;
    const patient = enc?.patientId ? await patients.byIdUnscoped(enc.patientId) : undefined;
    const clinician = enc ? await users.byId(enc.userId) : undefined;
    const letter = buildAppealLetter({ claim, remit: last, patient: { name: patient?.name ?? "Patient", dob: patient?.dob ?? "", memberId: patient?.chart.coverage?.memberId }, clinician: clinician?.name ?? user.name, dos: (enc?.scheduledAt ?? at).slice(0, 10), noteExcerpt: await noteExcerpt(encId), payer: claim.payer });
    lifecycle.appeal = { at, by: user.name, letter, status: "sent" };
    status = "appealed";
  } else if (action === "appeal_result") {
    if (status !== "appealed" || !lifecycle.appeal) throw new Error("No open appeal");
    const outcome = opts.outcome === "won" ? "won" : "lost";
    lifecycle.appeal = { ...lifecycle.appeal, status: outcome, resolvedAt: at };
    if (outcome === "won") {
      const last = lifecycle.remits.at(-1)!;
      const denied = last.lines.filter((l) => l.paid + l.patientResp === 0);
      const lines = denied.map((l) => {
        const line = claim.lines.find((x) => x.id === l.lineId);
        const allowed = Math.round(Math.min(l.billed, (line?.pricing?.allowed ?? l.billed * 0.6) * (line?.units ?? 1)) * 100) / 100;
        const coins = (line?.pricing?.coinsurance ?? 20) / 100;
        const patientResp = Math.round(allowed * coins * 100) / 100;
        return { lineId: l.lineId, cpt: l.cpt, billed: l.billed, allowed, paid: Math.round((allowed - patientResp) * 100) / 100, patientResp, adjustments: [...(l.billed > allowed ? [{ group: "CO" as const, carc: "45", amount: Math.round((l.billed - allowed) * 100) / 100 }] : []), ...(patientResp ? [{ group: "PR" as const, carc: "2", amount: patientResp }] : [])] };
      });
      lifecycle.remits.push({ id: `rm_appeal_${Date.parse(at).toString(36)}`, at, source: "appeal", payerClaimId: last.payerClaimId, lines, totals: totalsOf(lines) });
      status = statusFromRemits(lifecycle.remits);
    } else {
      lifecycle.writeOff = balanceOf({ content: claim, lifecycle, status: "denied" }).deniedOpen;
      lifecycle.closedAt = at;
      status = "closed";
    }
    note = note ?? `Appeal ${outcome}`;
  } else if (action === "close") {
    if (!["paid", "partial", "denied"].includes(status)) throw new Error("Only adjudicated claims can be closed");
    lifecycle.writeOff = balanceOf({ content: claim, lifecycle, status }).deniedOpen;
    lifecycle.closedAt = at;
    status = "closed";
  } else if (action === "add_opportunity") {
    const opp = claim.opportunities.find((o) => o.id === opts.opportunityId);
    if (!opp?.line) throw new Error("That opportunity has no billable line");
    if (LOCKED.includes(status)) throw new Error("Claim already submitted");
    claim = await revalidate(user, encId, { ...claim, lines: [...claim.lines, opp.line], opportunities: claim.opportunities.filter((o) => o.id !== opp.id) });
    status = claimStatus(claim);
  } else {
    throw new Error("Unknown action");
  }
  history.push({ at, action, note, by: user.name });
  return claims.save(enc?.userId ?? user.id, encId, status, claim, history, action === "hold" ? note : undefined, lifecycle);
}

function manualRemit(claim: Claim, input: Partial<Remit>, at: string): Remit {
  const lines: RemitLine[] = (input.lines ?? []).map((l) => {
    const line = claim.lines.find((x) => x.id === l.lineId || x.cpt === l.cpt);
    if (!line) throw new Error(`Remittance line ${l.cpt ?? l.lineId} does not match a claim line`);
    const n = (v: unknown) => Math.max(0, Math.round(Number(v ?? 0) * 100) / 100);
    const adjustments = (l.adjustments ?? []).map((a) => {
      if (!["CO", "PR", "OA", "PI", "CR"].includes(a.group)) throw new Error(`Unknown adjustment group ${a.group}`);
      if (!/^[A-Z]?\d{1,3}$/.test(String(a.carc))) throw new Error(`Invalid CARC ${a.carc}`);
      return { group: a.group, carc: String(a.carc), amount: n(a.amount) };
    });
    return { lineId: line.id, cpt: line.cpt, billed: line.charge, allowed: n(l.allowed), paid: n(l.paid), patientResp: n(l.patientResp), adjustments };
  });
  if (!lines.length) throw new Error("Enter at least one remittance line");
  return { id: `rm_manual_${Date.parse(at).toString(36)}`, at, source: "manual", payerClaimId: String(input.payerClaimId ?? "").trim() || "MANUAL", lines, totals: totalsOf(lines) };
}

interface RevenueRow {
  encounterId: string;
  patient: string;
  date: string;
  status: ClaimStatus;
  em: string;
  dx: string[];
  charges: number;
  errors: number;
  warnings: number;
  opportunities: number;
  clinician: string;
  payer: string;
  expected: number | null;
  paid: number;
  patientBalance: number;
  deniedOpen: number;
  outstanding: number;
  writeOff: number;
  submittedAt: string | null;
  denial: ReturnType<typeof denialOf>;
  appeal: "sent" | "won" | "lost" | null;
  signedAt: string | null;
}

export async function revenueSummary(user: User) {
  const list = await claims.list(user);
  const rows: RevenueRow[] = [];
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
      payer: r.content.payer,
      ...balanceOf(r),
      submittedAt: r.lifecycle.submittedAt ?? null,
      denial: (() => { const last = r.lifecycle.remits.at(-1); const d = last ? denialOf(last) : null; return d && ["denied", "partial"].includes(r.status) ? d : null; })(),
      appeal: r.lifecycle.appeal?.status ?? null,
      signedAt: enc?.signedAt ?? null,
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
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const day = 86400000;
  const now = Date.now();
  const buckets: [string, number, number][] = [["0-30", 0, 30], ["31-60", 31, 60], ["61-90", 61, 90], ["91-120", 91, 120], ["120+", 121, Infinity]];
  const aging = buckets.map(([label, lo, hi]) => {
    const inBucket = rows.filter((r) => (r.outstanding > 0 || r.deniedOpen > 0) && (() => { const age = Math.floor((now - new Date(r.date).getTime()) / day); return age >= lo && age <= hi; })());
    return { label, count: inBucket.length, amount: r2(inBucket.reduce((s, r) => s + r.outstanding + r.deniedOpen, 0)) };
  });
  const adjudicated = list.filter((r) => r.lifecycle.remits.length);
  const firstPass = adjudicated.filter((r) => !denialOf(r.lifecycle.remits[0])).length;
  const submitted = list.filter((r) => r.lifecycle.submittedAt);
  const acceptedFirst = submitted.filter((r) => !r.history.some((h) => h.action === "submit" && /Rejected/.test(h.note ?? ""))).length;
  const lagDays = submitted.map((r) => { const e = rows.find((x) => x.encounterId === r.encounterId)!; return (new Date(r.lifecycle.submittedAt!).getTime() - new Date(e.date).getTime()) / day; }).filter((x) => x >= 0);
  const expected = rows.reduce((s, r) => s + (r.expected ?? 0), 0);
  const paid = rows.reduce((s, r) => s + r.paid, 0);
  const patientResp = rows.reduce((s, r) => s + r.patientBalance, 0);
  const adjExpected = rows.filter((r) => list.find((x) => x.encounterId === r.encounterId)!.lifecycle.remits.length).reduce((s, r) => s + (r.expected ?? 0), 0);
  const kpis = {
    expectedAllowed: r2(expected),
    collected: r2(paid),
    patientResponsibility: r2(patientResp),
    outstanding: r2(rows.reduce((s, r) => s + r.outstanding + r.deniedOpen, 0)),
    writeOffs: r2(rows.reduce((s, r) => s + r.writeOff, 0)),
    firstPassRate: adjudicated.length ? Math.round((firstPass / adjudicated.length) * 100) : null,
    cleanSubmissionRate: submitted.length ? Math.round((acceptedFirst / submitted.length) * 100) : null,
    denialRate: adjudicated.length ? Math.round(((adjudicated.length - firstPass) / adjudicated.length) * 100) : null,
    netCollectionRate: adjExpected ? Math.round(((paid + patientResp) / adjExpected) * 100) : null,
    avgChargeLagDays: lagDays.length ? Math.round((lagDays.reduce((a, b) => a + b, 0) / lagDays.length) * 10) / 10 : null,
    claimsSubmitted: submitted.length,
    claimsAdjudicated: adjudicated.length,
  };
  const denials = rows.filter((r) => r.denial).map((r) => ({ encounterId: r.encounterId, patient: r.patient, date: r.date, payer: r.payer, status: r.status, amount: r.deniedOpen, category: r.denial!.category, carcs: r.denial!.carcs, lines: r.denial!.lines, action: r.denial!.action, appeal: r.appeal }));
  return { rows, byStatus, leakage, priorAuth: pa, kpis, aging, denials, totals: { charges: Math.round(rows.reduce((s, r) => s + r.charges, 0) * 100) / 100, leakageValue: Object.values(leakage).reduce((s, l) => s + l.value, 0) } };
}
