import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { all, get, now, run, uid } from "../db";
import { noteToText } from "../engine/note";
import { seal, unseal } from "../fhir/crypto";
import { sendOrgEmail } from "./notify";
import { Forbidden, Invalid } from "./policy";
import { assertNotGuest } from "./guest";
import { addenda, audit, encounters, notes, orgs, patients, SEES_ORG, users, type User } from "./repo";

export type ShareAccess = "view" | "edit";

export interface EncounterShare {
  id: string;
  encounterId: string;
  kind: "member" | "external";
  userId: string | null;
  userName: string | null;
  email: string | null;
  access: ShareAccess;
  expiresAt: string | null;
  revokedAt: string | null;
  verifiedAt: string | null;
  views: number;
  lastViewedAt: string | null;
  message: string;
  createdBy: string;
  createdAt: string;
}

interface Row {
  id: string;
  org_id: string;
  encounter_id: string;
  kind: string;
  user_id: string | null;
  user_name: string | null;
  email: string | null;
  access: string;
  token_hash: string | null;
  code_hash: string | null;
  code_expires_at: string | null;
  attempts: number;
  verified_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  views: number;
  last_viewed_at: string | null;
  message: string;
  created_by: string;
  created_at: string;
}

const SELECT = "SELECT s.*, u.name AS user_name FROM encounter_shares s LEFT JOIN users u ON u.id = s.user_id";

const toShare = (r: Row): EncounterShare => ({ id: r.id, encounterId: r.encounter_id, kind: r.kind as EncounterShare["kind"], userId: r.user_id, userName: r.user_name, email: r.email, access: r.access as ShareAccess, expiresAt: r.expires_at, revokedAt: r.revoked_at, verifiedAt: r.verified_at, views: Number(r.views), lastViewedAt: r.last_viewed_at, message: r.message, createdBy: r.created_by, createdAt: r.created_at });

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
export const SHARE_COOKIE = "cs_xshare";

async function ownEncounter(u: User, encId: string) {
  const enc = await encounters.get(u, encId);
  if (!enc) throw new Error("Encounter not found");
  if (enc.userId !== u.id && !SEES_ORG.has(u.role)) throw new Forbidden("Only the visit's clinician or an admin can share this visit");
  return enc;
}

async function isSensitive(encId: string) {
  return !!(await notes.latest(encId))?.content.meta.sensitive;
}

export async function listShares(u: User, encId: string) {
  await ownEncounter(u, encId);
  return (await all<Row>(`${SELECT} WHERE s.encounter_id = ? AND s.org_id = ? ORDER BY s.created_at DESC`, encId, u.orgId)).map(toShare);
}

export async function shareWithMember(u: User, encId: string, input: { userId?: string; access?: ShareAccess; message?: string }) {
  assertNotGuest(u, "share visits");
  const enc = await ownEncounter(u, encId);
  const access: ShareAccess = input.access === "edit" ? "edit" : "view";
  if (!input.userId) throw new Invalid("Choose a colleague");
  if (input.userId === enc.userId) throw new Invalid("That clinician already owns this visit");
  const m = await orgs.membership(u.orgId, input.userId);
  if (!m || m.status !== "active") throw new Invalid("Choose an active member of your organization");
  if (access === "edit" && !["owner", "admin", "clinician", "scribe"].includes(m.role)) throw new Invalid("That member's role can only be given view access");
  const existing = await get<Row>(`${SELECT} WHERE s.encounter_id = ? AND s.kind = 'member' AND s.user_id = ? AND s.revoked_at IS NULL`, encId, input.userId);
  if (existing) {
    await run("UPDATE encounter_shares SET access = ?, message = ? WHERE id = ?", access, (input.message ?? existing.message).slice(0, 500), existing.id);
    await audit.log(u, encId, "share.updated", { shareId: existing.id, access });
    return toShare((await get<Row>(`${SELECT} WHERE s.id = ?`, existing.id))!);
  }
  const id = uid("shr_");
  await run("INSERT INTO encounter_shares (id, org_id, encounter_id, kind, user_id, access, message, created_by, created_at) VALUES (?, ?, ?, 'member', ?, ?, ?, ?, ?)", id, u.orgId, encId, input.userId, access, (input.message ?? "").slice(0, 500), u.id, now());
  await audit.log(u, encId, "share.created", { shareId: id, kind: "member", userId: input.userId, access });
  return toShare((await get<Row>(`${SELECT} WHERE s.id = ?`, id))!);
}

export async function shareExternal(u: User, encId: string, input: { email?: string; days?: number; message?: string }, origin: string) {
  assertNotGuest(u, "share visits");
  const enc = await ownEncounter(u, encId);
  const org = await orgs.get(u.orgId);
  if ((org?.settings as { sharing?: { external?: boolean } } | undefined)?.sharing?.external === false) throw new Forbidden("Your organization has turned off external sharing");
  const email = (input.email ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) throw new Invalid("Enter the recipient's email address");
  if (await isSensitive(encId)) throw new Invalid("Behavioral health notes can't be shared outside your organization");
  if (!(await notes.latest(encId))) throw new Invalid("Draft the note before sharing it");
  const days = Math.min(30, Math.max(1, Math.round(input.days ?? 7)));
  const token = randomBytes(24).toString("base64url");
  const id = uid("shr_");
  const expires = new Date(Date.now() + days * 86400000).toISOString();
  await run("INSERT INTO encounter_shares (id, org_id, encounter_id, kind, email, access, token_hash, expires_at, message, created_by, created_at) VALUES (?, ?, ?, 'external', ?, 'view', ?, ?, ?, ?, ?)", id, u.orgId, encId, email, sha(token), expires, (input.message ?? "").slice(0, 500), u.id, now());
  const url = `${origin.replace(/\/$/, "")}/x/${token}`;
  const patient = enc.patientId ? await patients.get(u, enc.patientId) : undefined;
  const initials = patient ? patient.name.split(/\s+/).map((p) => p[0]).join("") : "a patient";
  const body = `${u.name} shared a visit note with you (patient ${initials}, ${new Date(enc.scheduledAt).toLocaleDateString("en-US")}).${input.message?.trim() ? `\n\n"${input.message.trim()}"` : ""}\n\nOpen it here. You'll get a one-time code at this email address to confirm it's you:\n\n${url}\n\nThe link expires in ${days} day${days === 1 ? "" : "s"}.`;
  const sent = await sendOrgEmail({ orgId: u.orgId, to: email, subject: `${u.name} shared a visit note with you`, body, kind: "share_link", encounterId: encId, actorId: u.id });
  await audit.log(u, encId, "share.created", { shareId: id, kind: "external", email, days, delivery: sent.status });
  return { share: toShare((await get<Row>(`${SELECT} WHERE s.id = ?`, id))!), url, delivery: sent.status };
}

export async function revokeShare(u: User, encId: string, shareId: string) {
  await ownEncounter(u, encId);
  const r = await get<Row>("SELECT * FROM encounter_shares WHERE id = ? AND encounter_id = ? AND org_id = ?", shareId, encId, u.orgId);
  if (!r) throw new Error("Share not found");
  await run("UPDATE encounter_shares SET revoked_at = ? WHERE id = ?", now(), shareId);
  await audit.log(u, encId, "share.revoked", { shareId });
}

export async function sharedWithMe(u: User) {
  const rows = await all<Row & { reason: string; scheduled_at: string; patient_name: string | null; owner_name: string }>(
    "SELECT s.*, e.reason, e.scheduled_at, p.name AS patient_name, o.name AS owner_name, NULL AS user_name FROM encounter_shares s JOIN encounters e ON e.id = s.encounter_id LEFT JOIN patients p ON p.id = e.patient_id JOIN users o ON o.id = e.user_id WHERE s.org_id = ? AND s.kind = 'member' AND s.user_id = ? AND s.revoked_at IS NULL ORDER BY s.created_at DESC LIMIT 50",
    u.orgId, u.id,
  );
  return rows.map((r) => ({ ...toShare(r), reason: r.reason, scheduledAt: r.scheduled_at, patientName: r.patient_name, ownerName: r.owner_name }));
}

async function snapshot(encId: string, opts: { transcript: boolean }) {
  const enc = await encounters.byIdUnscoped(encId);
  if (!enc) throw new Error("Encounter not found");
  const patient = enc.patientId ? await patients.byIdUnscoped(enc.patientId) : undefined;
  const clinician = await users.byId(enc.userId);
  const note = await notes.latest(encId);
  const adds = await addenda.list(encId);
  return {
    encounterId: enc.id,
    patient: patient ? { name: patient.name, dob: patient.dob, sex: patient.sex, mrn: patient.mrn } : null,
    clinician: clinician?.name ?? "Clinician",
    date: enc.scheduledAt,
    reason: enc.reason,
    status: enc.status,
    signedAt: enc.signedAt,
    noteText: note ? noteToText(note.content) : "",
    addenda: adds.map((a) => ({ kind: a.kind, text: a.text, author: a.author, at: a.createdAt })),
    transcript: opts.transcript ? [] : [],
  };
}

export async function memberView(u: User, shareId: string) {
  const r = await get<Row>(`${SELECT} WHERE s.id = ? AND s.org_id = ? AND s.kind = 'member'`, shareId, u.orgId);
  if (!r || r.user_id !== u.id || r.revoked_at) return null;
  await run("UPDATE encounter_shares SET views = views + 1, last_viewed_at = ? WHERE id = ?", now(), shareId);
  await audit.log(u, r.encounter_id, "share.viewed", { shareId });
  return { share: toShare(r), ...(await snapshot(r.encounter_id, { transcript: false })) };
}

async function byToken(token: string) {
  const r = await get<Row>(`${SELECT} WHERE s.token_hash = ? AND s.kind = 'external'`, sha(token));
  if (!r || r.revoked_at || (r.expires_at && r.expires_at < now())) return null;
  return r;
}

const mask = (email: string) => email.replace(/^(.)[^@]*(@.*)$/, "$1•••$2");

export async function externalInfo(token: string) {
  const r = await byToken(token);
  if (!r) return null;
  const from = await users.byId(r.created_by);
  const org = await orgs.get(r.org_id);
  return { email: mask(r.email ?? ""), from: from?.name ?? "A clinician", org: org?.name ?? "", expiresAt: r.expires_at };
}

export async function sendCode(token: string) {
  const r = await byToken(token);
  if (!r) throw new Invalid("This link is no longer valid");
  if (r.code_expires_at && new Date(r.code_expires_at).getTime() - CODE_TTL_MS > Date.now() - 30000) throw new Invalid("A code was just sent. Wait 30 seconds before asking again.");
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  await run("UPDATE encounter_shares SET code_hash = ?, code_expires_at = ?, attempts = 0 WHERE id = ?", sha(`${r.id}:${code}`), new Date(Date.now() + CODE_TTL_MS).toISOString(), r.id);
  const sent = await sendOrgEmail({ orgId: r.org_id, to: r.email!, subject: "Your Chartside verification code", body: `Your code is ${code}. It expires in 10 minutes. If you didn't ask for it, ignore this email.`, kind: "share_code", encounterId: r.encounter_id });
  await audit.log({ id: null, orgId: r.org_id }, r.encounter_id, "share.code_sent", { shareId: r.id, delivery: sent.status });
  if (sent.status !== "sent") throw new Invalid("We couldn't send the code. Ask the sender to share the note another way.");
  return { email: mask(r.email!) };
}

export async function verifyCode(token: string, code: string) {
  const r = await byToken(token);
  if (!r) throw new Invalid("This link is no longer valid");
  if (!r.code_hash || !r.code_expires_at || r.code_expires_at < now()) throw new Invalid("Request a new code");
  if (r.attempts >= MAX_ATTEMPTS) throw new Invalid("Too many tries. Request a new code.");
  const a = Buffer.from(sha(`${r.id}:${code.trim()}`));
  const b = Buffer.from(r.code_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await run("UPDATE encounter_shares SET attempts = attempts + 1 WHERE id = ?", r.id);
    await audit.log({ id: null, orgId: r.org_id }, r.encounter_id, "share.code_failed", { shareId: r.id });
    throw new Invalid(r.attempts + 1 >= MAX_ATTEMPTS ? "Too many tries. Request a new code." : "That code isn't right");
  }
  const exp = Math.min(Date.now() + 12 * 3600000, new Date(r.expires_at!).getTime());
  await run("UPDATE encounter_shares SET code_hash = NULL, verified_at = ? WHERE id = ?", now(), r.id);
  await audit.log({ id: null, orgId: r.org_id }, r.encounter_id, "share.verified", { shareId: r.id });
  return { cookie: seal(JSON.stringify({ s: r.id, exp })), expires: new Date(exp) };
}

export async function externalView(token: string, cookie: string | undefined) {
  const r = await byToken(token);
  if (!r || !cookie) return null;
  try {
    const c = JSON.parse(unseal(cookie)) as { s: string; exp: number };
    if (c.s !== r.id || c.exp < Date.now()) return null;
  } catch {
    return null;
  }
  await run("UPDATE encounter_shares SET views = views + 1, last_viewed_at = ? WHERE id = ?", now(), r.id);
  await audit.log({ id: null, orgId: r.org_id }, r.encounter_id, "share.viewed", { shareId: r.id, external: true });
  const from = await users.byId(r.created_by);
  return { from: from?.name ?? "", message: r.message, ...(await snapshot(r.encounter_id, { transcript: false })) };
}
