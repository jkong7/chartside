import { all, get, nextOrd, now, run, uid } from "../db";
import { docDef, DOCUMENTS, missingFields, requestedDocs, type DocContext, type DocType } from "../engine/documents";
import type { Encounter } from "../types";
import { textPdf } from "../pdf";
import { canSign, Forbidden, Invalid } from "./policy";
import { factsFor } from "./pipeline";
import { artifacts, audit, encounters, j, orgs, users, utterances, type User } from "./repo";

export interface ClinicalDocument {
  id: string;
  encounterId: string;
  type: DocType | "referral";
  label: string;
  title: string;
  fields: Record<string, string>;
  body: string;
  custom: boolean;
  status: "draft" | "final";
  shared: boolean;
  source: "manual" | "auto" | "requested";
  evidence: string[];
  missing: string[];
  signedBy: string | null;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DocRow {
  id: string;
  encounter_id: string;
  type: string;
  title: string;
  fields: string;
  body: string;
  custom: number;
  status: string;
  shared: number;
  source: string;
  evidence: string;
  signed_by_name: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

const toDoc = (r: DocRow): ClinicalDocument => {
  const def = docDef(r.type);
  const fields = j<Record<string, string>>(r.fields, {});
  return { id: r.id, encounterId: r.encounter_id, type: r.type as DocType, label: def?.label ?? "Document", title: r.title, fields, body: r.body, custom: !!r.custom, status: r.status as ClinicalDocument["status"], shared: !!r.shared, source: r.source as ClinicalDocument["source"], evidence: j(r.evidence, []), missing: def ? missingFields(def, fields) : [], signedBy: r.signed_by_name, signedAt: r.signed_at, createdAt: r.created_at, updatedAt: r.updated_at };
};

const SELECT = "SELECT d.*, u.name AS signed_by_name FROM documents d LEFT JOIN users u ON u.id = d.signed_by";

export const documents = {
  list: async (encId: string) => (await all<DocRow>(`${SELECT} WHERE d.encounter_id = ? ORDER BY d.ord`, encId)).map(toDoc),
  get: async (encId: string, id: string) => {
    const r = await get<DocRow>(`${SELECT} WHERE d.encounter_id = ? AND d.id = ?`, encId, id);
    return r ? toDoc(r) : undefined;
  },
  shared: async (encId: string) => (await all<DocRow>(`${SELECT} WHERE d.encounter_id = ? AND d.shared = 1 AND d.status = 'final' ORDER BY d.ord`, encId)).map(toDoc),
};

async function context(user: User, enc: Encounter & { orgId?: string | null }): Promise<DocContext> {
  const { facts, patient } = await factsFor(user, enc);
  const clin = (await users.byId(enc.userId)) ?? user;
  const m = await orgs.membership(enc.orgId ?? user.orgId, enc.userId);
  const org = await orgs.get(enc.orgId ?? user.orgId);
  return { facts, utterances: await utterances.list(enc.id), patient, clinician: { name: clin.name, specialty: clin.specialty, credential: m?.credential || undefined }, org: { name: org?.name ?? "" }, visitDate: new Date(enc.scheduledAt) };
}

async function scoped(user: User, encId: string) {
  const enc = await encounters.get(user, encId);
  if (!enc) throw new Error("Encounter not found");
  return enc;
}

export async function createDocument(user: User, encId: string, type: string, opts: { source?: ClinicalDocument["source"]; evidence?: string[] } = {}) {
  const enc = await scoped(user, encId);
  const def = docDef(type);
  if (!def) throw new Invalid("Unknown document type");
  const ctx = await context(user, enc);
  const fields = def.prefill(ctx);
  const r = def.render(fields, ctx);
  const id = uid("doc_");
  const t = now();
  await run("INSERT INTO documents (id, encounter_id, type, title, fields, body, status, source, evidence, created_by, ord, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)", id, enc.id, def.type, r.title, JSON.stringify(fields), r.body, opts.source ?? "manual", JSON.stringify(opts.evidence ?? []), user.id, nextOrd(), t, t);
  await audit.log(user, enc.id, "document.created", { id, type: def.type, source: opts.source ?? "manual" });
  return (await documents.get(enc.id, id))!;
}

export async function autoDocuments(user: User, enc: Encounter & { orgId?: string | null }) {
  const existing = await documents.list(enc.id);
  const author = enc.userId === user.id ? user : await users.byId(enc.userId);
  const wanted = new Map<string, { source: ClinicalDocument["source"]; evidence: string[] }>();
  for (const r of requestedDocs(await utterances.list(enc.id))) wanted.set(r.type, { source: "requested", evidence: r.evidence });
  for (const t of author?.prefs.autoDocuments ?? []) if (!wanted.has(t)) wanted.set(t, { source: "auto", evidence: [] });
  for (const [type, meta] of wanted) if (!existing.some((d) => d.type === type) && docDef(type)) await createDocument(user, enc.id, type, meta);
}

export async function updateDocument(user: User, encId: string, id: string, patch: { fields?: Record<string, string>; body?: string; shared?: boolean; action?: "finalize" | "reopen" }) {
  const enc = await scoped(user, encId);
  const doc = await documents.get(enc.id, id);
  if (!doc) throw new Error("Document not found");
  const def = docDef(doc.type)!;
  if (patch.shared !== undefined) {
    if (doc.status !== "final" && patch.shared) throw new Invalid("Sign the document before sharing it with the patient");
    await run("UPDATE documents SET shared = ?, updated_at = ? WHERE id = ?", patch.shared ? 1 : 0, now(), id);
    await audit.log(user, enc.id, patch.shared ? "document.shared" : "document.unshared", { id });
  }
  if (patch.action === "finalize") {
    if (doc.status === "final") throw new Invalid("Already signed");
    if (!canSign(user, enc)) throw new Forbidden("Only the treating clinician can sign documents for this visit");
    if (doc.missing.length) throw new Invalid(`Fill in: ${doc.missing.join(", ")}`);
    if (doc.body.includes("***")) throw new Invalid("Replace every *** before signing");
    await run("UPDATE documents SET status = 'final', signed_by = ?, signed_at = ?, updated_at = ? WHERE id = ?", user.id, now(), now(), id);
    const TASK_KEYS: Record<string, string> = { work_note: "doc:work note", school_note: "doc:school note", fmla: "doc:fmla paperwork", jury_duty: "doc:jury duty letter", medical_necessity: "doc:letter of medical necessity" };
    if (TASK_KEYS[doc.type]) await run("UPDATE tasks SET status = 'done', completed_by = ?, completed_at = ? WHERE encounter_id = ? AND key = ? AND status = 'open'", user.id, now(), enc.id, TASK_KEYS[doc.type]);
    await audit.log(user, enc.id, "document.signed", { id, type: doc.type });
  } else if (patch.action === "reopen") {
    if (!canSign(user, enc)) throw new Forbidden("Only the treating clinician can reopen documents");
    await run("UPDATE documents SET status = 'draft', shared = 0, signed_by = NULL, signed_at = NULL, updated_at = ? WHERE id = ?", now(), id);
    await audit.log(user, enc.id, "document.reopened", { id });
  } else if (patch.fields || patch.body !== undefined) {
    if (doc.status === "final") throw new Invalid("Signed documents are locked. Reopen it to make changes.");
    const fields = { ...doc.fields, ...Object.fromEntries(Object.entries(patch.fields ?? {}).map(([k, v]) => [k, String(v ?? "").slice(0, 4000)])) };
    let body = doc.body;
    let custom = doc.custom;
    let title = doc.title;
    if (patch.body !== undefined) {
      body = patch.body.slice(0, 20000);
      custom = true;
    } else if (!doc.custom) {
      const ctx = await context(user, enc);
      const r = def.render(fields, ctx);
      body = r.body;
      title = r.title;
    }
    await run("UPDATE documents SET fields = ?, body = ?, title = ?, custom = ?, updated_at = ? WHERE id = ?", JSON.stringify(fields), body, title, custom ? 1 : 0, now(), id);
  }
  return (await documents.get(enc.id, id))!;
}

export async function deleteDocument(user: User, encId: string, id: string) {
  const enc = await scoped(user, encId);
  const doc = await documents.get(enc.id, id);
  if (!doc) throw new Error("Document not found");
  if (doc.status === "final") throw new Invalid("Signed documents can't be deleted. Reopen it first.");
  await run("DELETE FROM documents WHERE id = ?", id);
  await audit.log(user, enc.id, "document.deleted", { id });
}

export async function documentPdf(enc: Encounter & { orgId?: string | null }, doc: { title: string; body: string; status?: string; signedBy?: string | null; signedAt?: string | null }) {
  const org = await orgs.get(enc.orgId ?? "");
  const signed = doc.status === "final" && doc.signedAt ? `Signed electronically by ${doc.signedBy} on ${new Date(doc.signedAt).toLocaleString("en-US")}` : "DRAFT: not signed";
  return textPdf({ title: doc.title, letterhead: org?.name, body: doc.body, footer: signed });
}

export async function referralDocs(encId: string) {
  return ((await artifacts.get<{ specialty: string; text: string }[]>(encId, "letters")) ?? []).map((l, i) => ({ id: `referral-${i}`, title: `Referral to ${l.specialty}`, body: l.text }));
}

export const DOCUMENT_TYPES = DOCUMENTS.map((d) => ({ type: d.type, label: d.label, description: d.description, fields: d.fields }));
