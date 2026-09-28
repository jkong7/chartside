import { createHash, timingSafeEqual } from "node:crypto";
import { all, get, now, run, uid } from "../db";
import { pdfToText } from "../engine/records";
import { assertCan, Invalid } from "./policy";
import { importRecord } from "./records";
import { audit, orgs, patients, type User } from "./repo";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function inboundSecret(orgId: string) {
  const org = await orgs.get(orgId);
  return (org?.settings as { faxInbound?: { secretHash?: string } } | undefined)?.faxInbound?.secretHash ?? null;
}

export async function rotateInboundSecret(u: User) {
  assertCan(u, "org.manage");
  const secret = `fx_${createHash("sha256").update(`${Math.random()}${Date.now()}`).digest("hex").slice(0, 32)}`;
  const org = (await orgs.get(u.orgId))!;
  await orgs.update(org.id, { settings: { ...org.settings, faxInbound: { secretHash: sha(secret) } } as typeof org.settings });
  await audit.log(u, null, "fax.inbound_secret_rotated", {});
  return secret;
}

export async function receiveFax(orgId: string, secret: string, input: { from?: string; pages?: number; pdf: Buffer }) {
  const want = await inboundSecret(orgId);
  const a = Buffer.from(sha(secret));
  if (!want || a.length !== Buffer.from(want).length || !timingSafeEqual(a, Buffer.from(want))) throw new Invalid("Unauthorized");
  if (input.pdf.subarray(0, 5).toString() !== "%PDF-") throw new Invalid("A PDF is required");
  if (input.pdf.length > 15 * 1024 * 1024) throw new Invalid("Faxes are limited to 15 MB");
  const id = uid("fax_");
  await run("INSERT INTO inbound_faxes (id, org_id, from_number, pages, pdf, text, status, received_at) VALUES (?, ?, ?, ?, ?, ?, 'new', ?)", id, orgId, (input.from ?? "").slice(0, 30), Math.max(0, Math.round(input.pages ?? 0)), input.pdf.toString("base64"), pdfToText(input.pdf).slice(0, 200000), now());
  await audit.log({ id: null, orgId }, null, "fax.received", { id, from: input.from });
  return id;
}

function candidates(text: string, pats: { id: string; name: string; dob: string; mrn: string }[]) {
  const t = text.toLowerCase();
  const dobs = [...text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/g)].map((m) => (m[4] ? `${m[4]}-${m[5]}-${m[6]}` : `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`));
  return pats.map((p) => {
    const [first, ...rest] = p.name.toLowerCase().split(/\s+/);
    const last = rest.at(-1) ?? first;
    let score = 0;
    const why: string[] = [];
    if (t.includes(p.mrn.toLowerCase()) && p.mrn.length >= 4) { score += 5; why.push("MRN"); }
    if (new RegExp(`\\b${last}\\b`).test(t)) { score += 2; why.push("last name"); }
    if (new RegExp(`\\b${first}\\b`).test(t)) { score += 1; why.push("first name"); }
    if (dobs.includes(p.dob)) { score += 3; why.push("date of birth"); }
    return { patientId: p.id, name: p.name, score, why };
  }).filter((c) => c.score >= 3).sort((a, b) => b.score - a.score).slice(0, 3);
}

export async function faxInbox(u: User) {
  const rows = await all<{ id: string; from_number: string; pages: number; text: string; status: string; patient_id: string | null; received_at: string }>("SELECT id, from_number, pages, text, status, patient_id, received_at FROM inbound_faxes WHERE org_id = ? ORDER BY received_at DESC LIMIT 100", u.orgId);
  const pats = (await patients.list(u)).map((p) => ({ id: p.id, name: p.name, dob: p.dob, mrn: p.mrn }));
  return rows.map((r) => ({ id: r.id, from: r.from_number, pages: Number(r.pages), status: r.status, patientId: r.patient_id, receivedAt: r.received_at, preview: r.text.replace(/\s+/g, " ").slice(0, 240), suggestions: r.status === "new" ? candidates(r.text, pats) : [] }));
}

export async function fileFax(u: User, id: string, patientId: string) {
  assertCan(u, "patients.write");
  const r = await get<{ pdf: string; status: string; from_number: string; received_at: string }>("SELECT pdf, status, from_number, received_at FROM inbound_faxes WHERE org_id = ? AND id = ?", u.orgId, id);
  if (!r) throw new Error("Fax not found");
  if (r.status !== "new") throw new Invalid("This fax was already filed");
  const rec = await importRecord(u, patientId, { name: `Fax from ${r.from_number || "unknown"} (${r.received_at.slice(0, 10)})`, mime: "application/pdf", data: Buffer.from(r.pdf, "base64") });
  await run("UPDATE inbound_faxes SET status = 'filed', patient_id = ?, record_id = ? WHERE id = ?", patientId, rec.id, id);
  await audit.log(u, null, "fax.filed", { id, patientId, closedReferrals: rec.closedReferrals.length });
  return rec;
}

export async function discardFax(u: User, id: string) {
  assertCan(u, "patients.write");
  await run("UPDATE inbound_faxes SET status = 'discarded', pdf = '' WHERE org_id = ? AND id = ? AND status = 'new'", u.orgId, id);
  await audit.log(u, null, "fax.discarded", { id });
}
