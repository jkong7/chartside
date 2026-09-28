import { createConnection } from "node:net";
import { all, get, now, run, uid } from "../db";
import { buildMdmT02, frame, parseAck, unframe } from "../engine/hl7";
import { noteToText } from "../engine/note";
import { assertCan, Invalid } from "./policy";
import { audit, encounters, notes, orgs, patients, users, type User } from "./repo";

export interface Hl7Config {
  enabled: boolean;
  host: string;
  port: number;
  sendingFacility: string;
  receivingApp: string;
  receivingFacility: string;
  includeSensitive: boolean;
}

export async function hl7Config(orgId: string): Promise<Hl7Config | null> {
  const s = (await orgs.get(orgId))?.settings as { hl7?: Hl7Config } | undefined;
  return s?.hl7 ?? null;
}

export async function saveHl7Config(u: User, c: Partial<Hl7Config>) {
  assertCan(u, "org.manage");
  const host = (c.host ?? "").trim();
  const port = Number(c.port);
  if (c.enabled && (!/^[a-z0-9.-]+$/i.test(host) || !Number.isInteger(port) || port < 1 || port > 65535)) throw new Invalid("Enter the interface engine host and a port from 1 to 65535");
  const org = (await orgs.get(u.orgId))!;
  const next: Hl7Config = { enabled: !!c.enabled, host, port: Number.isInteger(port) ? port : 0, sendingFacility: (c.sendingFacility ?? org.name).slice(0, 40), receivingApp: (c.receivingApp ?? "EHR").slice(0, 40), receivingFacility: (c.receivingFacility ?? "").slice(0, 40), includeSensitive: !!c.includeSensitive };
  await orgs.update(org.id, { settings: { ...org.settings, hl7: next } as typeof org.settings });
  await audit.log(u, null, "hl7.configured", { enabled: next.enabled, host: next.host, port: next.port });
  return next;
}

export function sendMllp(host: string, port: number, msg: string, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = createConnection({ host, port });
    let buf = Buffer.alloc(0);
    const done = (err: Error | null, ack?: string) => {
      sock.destroy();
      if (err) reject(err);
      else resolve(ack!);
    };
    sock.setTimeout(timeoutMs, () => done(new Error("Timed out waiting for ACK")));
    sock.on("error", (e) => done(e));
    sock.on("connect", () => sock.write(frame(msg)));
    sock.on("data", (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      const m = unframe(buf);
      if (m) done(null, m);
    });
  });
}

export async function sendNoteHl7(u: User, encId: string, opts: { manual?: boolean } = {}) {
  const cfg = await hl7Config(u.orgId);
  if (!cfg?.enabled) return null;
  const enc = await encounters.get(u, encId);
  if (!enc || enc.status !== "signed" || !enc.patientId) throw new Invalid("Only signed notes with a patient can be sent");
  const rec = await notes.latest(encId);
  if (!rec) throw new Invalid("No note");
  if (rec.content.meta.sensitive && !cfg.includeSensitive) {
    await audit.log(u, encId, "hl7.skipped", { reason: "restricted note" });
    return { status: "skipped" as const, detail: "Restricted behavioral health notes aren't sent over the interface" };
  }
  const p = (await patients.get(u, enc.patientId))!;
  const clin = (await users.byId(enc.userId)) ?? u;
  const controlId = `CS${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`;
  const msg = buildMdmT02({ controlId, sendingApp: "CHARTSIDE", sendingFacility: cfg.sendingFacility, receivingApp: cfg.receivingApp, receivingFacility: cfg.receivingFacility, at: new Date(), patient: { mrn: p.mrn, name: p.name, dob: p.dob, sex: p.sex }, visitNumber: enc.externalId ?? enc.id, clinician: { id: clin.id.slice(-12), name: clin.name }, documentId: `${enc.id}-v${rec.version}`, documentType: "PN", signedAt: new Date(enc.signedAt ?? now()), lines: noteToText(rec.content).split("\n").filter((l) => l.trim()), sensitive: !!rec.content.meta.sensitive });
  const id = uid("hl7_");
  let status: "accepted" | "rejected" | "failed" = "failed";
  let detail = "";
  try {
    const ack = parseAck(await sendMllp(cfg.host, cfg.port, msg));
    status = ack.code === "AA" || ack.code === "CA" ? "accepted" : "rejected";
    detail = ack.code === "AA" || ack.code === "CA" ? `ACK ${ack.code}` : `ACK ${ack.code}${ack.text ? `: ${ack.text}` : ""}`;
    if (ack.controlId && ack.controlId !== controlId) detail += " (control ID mismatch)";
  } catch (e) {
    detail = e instanceof Error ? e.message : "Delivery failed";
  }
  await run("INSERT INTO hl7_messages (id, org_id, encounter_id, control_id, type, status, detail, message, created_at) VALUES (?, ?, ?, ?, 'MDM^T02', ?, ?, ?, ?)", id, u.orgId, encId, controlId, status, detail.slice(0, 300), msg, now());
  await audit.log(u, encId, `hl7.${status}`, { controlId, detail, manual: !!opts.manual });
  return { status, detail, controlId };
}

export async function hl7Log(u: User, encId?: string) {
  return all<{ id: string; encounter_id: string; control_id: string; status: string; detail: string; created_at: string }>(`SELECT id, encounter_id, control_id, status, detail, created_at FROM hl7_messages WHERE org_id = ? ${encId ? "AND encounter_id = ?" : ""} ORDER BY created_at DESC LIMIT 100`, ...(encId ? [u.orgId, encId] : [u.orgId]));
}

export async function hl7Message(u: User, id: string) {
  return (await get<{ message: string }>("SELECT message FROM hl7_messages WHERE org_id = ? AND id = ?", u.orgId, id))?.message ?? null;
}
