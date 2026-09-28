import { all, get, now, run, uid } from "../db";
import { extractRecords, recordsText, type RecordFinding } from "../engine/records";
import type { Chart } from "../types";
import { assertCan, Invalid } from "./policy";
import { audit, j, patients, type User } from "./repo";

export interface StoredFinding extends RecordFinding {
  status: "pending" | "accepted" | "dismissed";
  change: "new" | "update" | "same";
  current?: string;
}

export interface OutsideRecord {
  id: string;
  name: string;
  format: string;
  findings: StoredFinding[];
  uploadedBy: string | null;
  createdAt: string;
  text?: string;
}

const base = (s: string) => s.toLowerCase().split(/\s+/)[0];

function compare(f: RecordFinding, chart: Chart): Pick<StoredFinding, "change" | "current"> {
  if (f.kind === "medication") {
    const cur = chart.medications.find((m) => base(m.name) === base(f.label));
    if (!cur) return { change: "new" };
    const now2 = [cur.dose, cur.frequency].filter(Boolean).join(" ");
    const next = [f.value, f.detail].filter(Boolean).join(" ");
    return next && next !== now2 ? { change: "update", current: now2 } : { change: "same", current: now2 };
  }
  if (f.kind === "allergy") return chart.allergies.some((a) => base(a.substance) === base(f.label)) || /no known/i.test(f.label) ? { change: "same" } : { change: "new" };
  if (f.kind === "problem") return chart.problems.some((p) => (f.code && p.icd10?.slice(0, 3) === f.code.slice(0, 3)) || p.name.toLowerCase() === f.label.toLowerCase()) ? { change: "same" } : { change: "new" };
  if (f.kind === "lab") {
    const cur = (chart.labs ?? []).find((l) => l.name === f.label && (!f.date || l.date === f.date));
    return cur ? { change: cur.value === f.value ? "same" : "update", current: cur.value } : { change: "new" };
  }
  if (f.kind === "vital") {
    const cur = chart.vitals?.[f.label];
    return cur === f.value ? { change: "same", current: cur } : cur ? { change: "update", current: cur } : { change: "new" };
  }
  return { change: "new" };
}

export async function importRecord(u: User, patientId: string, input: { name: string; mime: string; data: Buffer }) {
  assertCan(u, "patients.write");
  const p = await patients.get(u, patientId);
  if (!p) throw new Error("Patient not found");
  if (input.data.length > 10 * 1024 * 1024) throw new Invalid("Files are limited to 10 MB");
  const { format, text } = recordsText(input.name, input.mime, input.data);
  if (text.replace(/\s/g, "").length < 20) throw new Invalid(format === "pdf" ? "No text found in this PDF. Scanned images need OCR before import." : "The document is empty");
  const findings: StoredFinding[] = extractRecords(text).map((f) => ({ ...f, ...compare(f, p.chart), status: "pending" }));
  for (const f of findings) if (f.change === "same") f.status = "dismissed";
  const id = uid("rec_");
  await run("INSERT INTO outside_records (id, org_id, patient_id, name, format, text, findings, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, u.orgId, patientId, input.name.slice(0, 120), format, text.slice(0, 200000), JSON.stringify(findings), u.id, now());
  await audit.log(u, null, "records.imported", { patientId, id, format, findings: findings.length });
  return (await recordsFor(u, patientId)).find((r) => r.id === id)!;
}

export async function recordsFor(u: User, patientId: string): Promise<OutsideRecord[]> {
  return (await all<{ id: string; name: string; format: string; findings: string; uploader: string | null; created_at: string }>("SELECT r.id, r.name, r.format, r.findings, us.name AS uploader, r.created_at FROM outside_records r LEFT JOIN users us ON us.id = r.uploaded_by WHERE r.org_id = ? AND r.patient_id = ? ORDER BY r.created_at DESC", u.orgId, patientId)).map((r) => ({ id: r.id, name: r.name, format: r.format, findings: j(r.findings, []), uploadedBy: r.uploader, createdAt: r.created_at }));
}

export async function recordText(u: User, patientId: string, id: string) {
  return (await get<{ text: string }>("SELECT text FROM outside_records WHERE org_id = ? AND patient_id = ? AND id = ?", u.orgId, patientId, id))?.text ?? null;
}

export async function reconcile(u: User, patientId: string, id: string, decisions: { index: number; action: "accept" | "dismiss" }[]) {
  assertCan(u, "patients.write");
  const p = await patients.get(u, patientId);
  if (!p) throw new Error("Patient not found");
  const rec = (await recordsFor(u, patientId)).find((r) => r.id === id);
  if (!rec) throw new Error("Record not found");
  const chart: Chart = JSON.parse(JSON.stringify(p.chart));
  const src = `outside:${rec.name}`;
  let accepted = 0;
  for (const d of decisions) {
    const f = rec.findings[d.index];
    if (!f || f.status !== "pending") continue;
    f.status = d.action === "accept" ? "accepted" : "dismissed";
    if (d.action !== "accept") continue;
    accepted++;
    if (f.kind === "medication") {
      const i = chart.medications.findIndex((m) => base(m.name) === base(f.label));
      const m = { name: i >= 0 ? chart.medications[i].name : f.label, dose: f.value, frequency: f.detail, source: src };
      if (i >= 0) chart.medications[i] = m;
      else chart.medications.push(m);
    } else if (f.kind === "allergy" && !/no known/i.test(f.label)) chart.allergies.push({ substance: f.label, reaction: f.detail, source: src });
    else if (f.kind === "problem") chart.problems.push({ name: f.label, icd10: f.code, since: f.date?.slice(0, 4), source: src });
    else if (f.kind === "lab") chart.labs = [...(chart.labs ?? []).filter((l) => !(l.name === f.label && l.date === (f.date ?? ""))), { name: f.label, value: f.value ?? "", date: f.date ?? rec.createdAt.slice(0, 10), source: src }];
    else if (f.kind === "vital") chart.vitals = { ...(chart.vitals ?? {}), [f.label]: f.value ?? "" };
    else if (f.kind === "plan") chart.priorVisits = [{ date: rec.createdAt.slice(0, 10), summary: `Outside records: ${rec.name}`, plan: [f.label] }, ...(chart.priorVisits ?? [])].slice(0, 10);
  }
  await patients.updateChart(u, patientId, chart);
  await run("UPDATE outside_records SET findings = ? WHERE id = ?", JSON.stringify(rec.findings), id);
  await audit.log(u, null, "records.reconciled", { patientId, id, accepted });
  return { accepted, records: await recordsFor(u, patientId) };
}
