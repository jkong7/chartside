import { all, get, now, run, uid } from "../db";
import { extractFlowsheet, shiftSummary, updateCareList, type CareItem, type FlowRow } from "../engine/flowsheet";
import { admissions } from "./inpatient";
import { assertCan, Invalid } from "./policy";
import { audit, j, type User } from "./repo";

export interface NursingNote {
  id: string;
  authorName: string | null;
  text: string;
  rows: FlowRow[];
  care: { added: CareItem[]; closed: CareItem[] };
  status: "draft" | "filed" | "discarded";
  recordedAt: string;
  filedAt: string | null;
}

export interface FlowEntry {
  id: string;
  group: string;
  row: string;
  value: string;
  abnormal: boolean;
  recordedAt: string;
  filedBy: string | null;
  noteId: string | null;
}

async function admissionFor(u: User, id: string) {
  const a = await admissions.get(u, id);
  if (!a) throw new Error("Admission not found");
  return a;
}

async function careOf(id: string) {
  return j<CareItem[]>((await get<{ care: string }>("SELECT care FROM admissions WHERE id = ?", id))?.care, []);
}

export async function draftAssessment(u: User, admissionId: string, text: string, recordedAt?: string) {
  assertCan(u, "nursing.document");
  const a = await admissionFor(u, admissionId);
  if (a.status !== "active") throw new Invalid("This patient has been discharged");
  const t = text.trim();
  if (t.length < 5) throw new Invalid("Record or type the assessment first");
  if (t.length > 8000) throw new Invalid("Assessments are limited to 8,000 characters");
  const rows = extractFlowsheet(t);
  const care = updateCareList(await careOf(admissionId), t);
  const id = uid("nn_");
  await run("INSERT INTO nursing_notes (id, org_id, admission_id, author_id, text, rows, care, status, recorded_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)", id, u.orgId, admissionId, u.id, t, JSON.stringify(rows), JSON.stringify({ added: care.added, closed: care.closed }), recordedAt ?? now(), now());
  return (await notesFor(u, admissionId)).find((n) => n.id === id)!;
}

export async function fileAssessment(u: User, admissionId: string, noteId: string, input: { rows?: { key: string; value: string }[]; care?: boolean }) {
  assertCan(u, "nursing.document");
  await admissionFor(u, admissionId);
  const note = (await notesFor(u, admissionId)).find((n) => n.id === noteId);
  if (!note) throw new Error("Assessment not found");
  if (note.status !== "draft") throw new Invalid("This assessment was already filed");
  const chosen = input.rows ?? note.rows.map((r) => ({ key: r.key, value: r.value }));
  const filed: FlowRow[] = [];
  for (const c of chosen) {
    const r = note.rows.find((x) => x.key === c.key);
    if (!r) continue;
    const value = String(c.value ?? "").trim().slice(0, 120);
    if (!value) continue;
    filed.push({ ...r, value });
    await run("INSERT INTO flowsheet (id, org_id, admission_id, note_id, group_name, row_name, value, abnormal, recorded_at, filed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", uid("fs_"), u.orgId, admissionId, noteId, r.group, r.row, value, r.abnormal ? 1 : 0, note.recordedAt, u.id, now());
  }
  if (input.care !== false) {
    const cur = await careOf(admissionId);
    const closed = new Set(note.care.closed.map((c) => c.key));
    const next = [...cur.filter((c) => !closed.has(c.key)), ...note.care.added.filter((a) => !cur.some((c) => c.key === a.key))];
    await run("UPDATE admissions SET care = ? WHERE id = ?", JSON.stringify(next), admissionId);
  }
  await run("UPDATE nursing_notes SET status = 'filed', rows = ?, filed_at = ? WHERE id = ?", JSON.stringify(filed), now(), noteId);
  await audit.log(u, null, "nursing.filed", { admissionId, noteId, rows: filed.length });
  return { filed: filed.length };
}

export async function discardAssessment(u: User, admissionId: string, noteId: string) {
  assertCan(u, "nursing.document");
  await run("UPDATE nursing_notes SET status = 'discarded' WHERE id = ? AND admission_id = ? AND org_id = ? AND status = 'draft'", noteId, admissionId, u.orgId);
}

export async function completeCare(u: User, admissionId: string, key: string) {
  assertCan(u, "nursing.document");
  await admissionFor(u, admissionId);
  const cur = await careOf(admissionId);
  const item = cur.find((c) => c.key === key);
  if (!item) throw new Error("Care item not found");
  await run("UPDATE admissions SET care = ? WHERE id = ?", JSON.stringify(cur.filter((c) => c.key !== key)), admissionId);
  await audit.log(u, null, "nursing.care_done", { admissionId, item: item.text.slice(0, 80) });
}

export async function addCare(u: User, admissionId: string, text: string) {
  assertCan(u, "nursing.document");
  await admissionFor(u, admissionId);
  const t = text.trim().slice(0, 200);
  if (!t) throw new Invalid("Describe the care item");
  const cur = await careOf(admissionId);
  const key = t.toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 60);
  if (!cur.some((c) => c.key === key)) cur.push({ key, text: t, due: null, evidence: "Added manually" });
  await run("UPDATE admissions SET care = ? WHERE id = ?", JSON.stringify(cur), admissionId);
}

export async function notesFor(u: User, admissionId: string): Promise<NursingNote[]> {
  return (await all<{ id: string; author_name: string | null; text: string; rows: string; care: string; status: string; recorded_at: string; filed_at: string | null }>("SELECT n.*, us.name AS author_name FROM nursing_notes n LEFT JOIN users us ON us.id = n.author_id WHERE n.org_id = ? AND n.admission_id = ? AND n.status <> 'discarded' ORDER BY n.recorded_at DESC", u.orgId, admissionId)).map((r) => ({ id: r.id, authorName: r.author_name, text: r.text, rows: j(r.rows, []), care: j(r.care, { added: [], closed: [] }), status: r.status as NursingNote["status"], recordedAt: r.recorded_at, filedAt: r.filed_at }));
}

export async function flowsheetFor(u: User, admissionId: string): Promise<FlowEntry[]> {
  return (await all<{ id: string; group_name: string; row_name: string; value: string; abnormal: number; recorded_at: string; filer: string | null; note_id: string | null }>("SELECT f.*, us.name AS filer FROM flowsheet f LEFT JOIN users us ON us.id = f.filed_by WHERE f.org_id = ? AND f.admission_id = ? ORDER BY f.recorded_at", u.orgId, admissionId)).map((r) => ({ id: r.id, group: r.group_name, row: r.row_name, value: r.value, abnormal: !!r.abnormal, recordedAt: r.recorded_at, filedBy: r.filer, noteId: r.note_id }));
}

export async function nursingView(u: User, admissionId: string) {
  await admissionFor(u, admissionId);
  const [entries, care, list] = await Promise.all([flowsheetFor(u, admissionId), careOf(admissionId), notesFor(u, admissionId)]);
  const since = Date.now() - 12 * 3600000;
  return { flowsheet: entries, care, notes: list, summary: shiftSummary(entries.filter((e) => new Date(e.recordedAt).getTime() >= since).map((e) => ({ ...e })), care) };
}

export async function askShift(u: User, admissionId: string, question: string) {
  const v = await nursingView(u, admissionId);
  const q = question.toLowerCase();
  const terms = q.match(/[a-z0-9]{3,}/g) ?? [];
  const alias: Record<string, string[]> = { bp: ["blood pressure"], pressure: ["blood pressure"], sugar: ["point-of-care glucose"], glucose: ["point-of-care glucose"], sats: ["spo2"], oxygen: ["spo2", "o2 device"], pain: ["pain score", "pain location"], urine: ["urine output"], ate: ["meal intake"], eat: ["meal intake"], walk: ["activity"], iv: ["peripheral iv", "iv site"], fall: ["fall risk (morse)", "fall precautions"] };
  const wanted = new Set<string>();
  for (const t of terms) for (const r of alias[t] ?? []) wanted.add(r);
  for (const e of v.flowsheet) if (terms.some((t) => e.row.toLowerCase().includes(t))) wanted.add(e.row.toLowerCase());
  const hits = v.flowsheet.filter((e) => wanted.has(e.row.toLowerCase()));
  const lines: string[] = [];
  const byRow = new Map<string, FlowEntry[]>();
  for (const h of hits) byRow.set(h.row, [...(byRow.get(h.row) ?? []), h]);
  for (const [row, es] of byRow) lines.push(`${row}: ${es.map((e) => `${e.value} at ${new Date(e.recordedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`).join(", ")}.`);
  if (/\b(pending|to do|todo|outstanding|left|need)\b/.test(q)) lines.push(v.care.length ? `Pending: ${v.care.map((c) => c.text).join("; ")}.` : "Nothing pending on the care list.");
  if (!lines.length) {
    const sentences = v.notes.filter((n) => n.status === "filed").flatMap((n) => n.text.split(/(?<=[.;!?])\s+/).map((s) => ({ s, at: n.recordedAt }))).filter(({ s }) => terms.filter((t) => s.toLowerCase().includes(t)).length >= Math.min(2, terms.length));
    for (const { s, at } of sentences.slice(-3)) lines.push(`"${s}" (${new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })})`);
  }
  return lines.length ? lines.join("\n") : "Nothing in this shift's nursing documentation answers that.";
}
