import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { all, get, now, run, tx, uid } from "../db";
import { ALL_PARTY_STATES, STATE_NAMES } from "../engine/lexicon";
import { extractFacts } from "../engine/extract";
import { buildVisitRecap, recapText, type VisitRecap } from "../engine/visitRecap";
import { llmEnabled, visitRecapWithClaude } from "../llm";
import { textPdf } from "../pdf";
import type { ConsentRecord } from "../types";
import { keyedHash, seal, unseal } from "../fhir/crypto";
import { deleteAudio, removeAudioFiles } from "./audio";
import { appendCapture, withEncounterLock, type CaptureInput } from "./capture";
import { CaptureAuthError } from "./captureTokens";
import { fail } from "./http";
import { deliver } from "./delivery";
import { claimNpi, lookupNpi } from "./growth";
import { limited } from "./ratelimit";
import { createGuest, purgeGuests } from "./guest";
import { trackLoop } from "./loops";
import { publicOrigin, requestEmailSignIn } from "./magic";
import { normalizePhone } from "./notify";
import { processEncounter, recordConsent } from "./pipeline";
import { Forbidden, Invalid } from "./policy";
import { actorFor, artifacts, audioChunks, audit, consents, encounters, orgs, utterances, type User } from "./repo";
import { sendText } from "./telephony/sms";

export const HOLDER_EMAIL_DOMAIN = "patient.chartside.invalid";
export const VISIT_METHOD: ConsentRecord["method"] = "clinician_tap_patient_device";
export const PATIENT_LABEL = "From a patient's recording";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha = (s: string) => createHash("sha256").update(`pv:${s}`).digest("hex");
export const contactTag = (s: string) => keyedHash("pv-audit-contact", s).slice(0, 32);
const newToken = () => randomBytes(24).toString("base64url");
const days = (name: string, fallback: number) => {
  const n = Number(process.env[name] ?? fallback);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
export const visitDays = () => days("CHARTSIDE_VISIT_DAYS", 7);
export const savedDays = () => days("CHARTSIDE_VISIT_SAVED_DAYS", 90);
export const offerDays = () => days("CHARTSIDE_VISIT_OFFER_DAYS", 7);
export const familyDays = () => days("CHARTSIDE_VISIT_FAMILY_DAYS", 7);
const inDays = (n: number, from = Date.now()) => new Date(from + n * 86400000).toISOString();

export type VisitStatus = "consent" | "declined" | "recording" | "processing" | "ready" | "failed";

export interface VisitRow {
  id: string;
  holder_id: string;
  encounter_id: string | null;
  status: VisitStatus;
  patient_name: string | null;
  state: string;
  clinician_name: string | null;
  clinician_phone: string | null;
  clinician_email: string | null;
  clinician_contact_kind: "sms" | "email" | null;
  clinician_contact_hmac: string | null;
  clinician_contact_sealed: string | null;
  claim_link_id: string | null;
  claim_code_hash: string | null;
  claim_code_expires_at: string | null;
  claim_code_attempts: number;
  claim_code_sent_at: string | null;
  claim_proof_hash: string | null;
  others_present: number;
  notes: string;
  family_hash: string | null;
  family_expires_at: string | null;
  offer_hash: string | null;
  offer_expires_at: string | null;
  offer_status: string | null;
  offer_channel: string | null;
  offer_sent_at: string | null;
  claimed_at: string | null;
  claimed_by: string | null;
  claimed_encounter_id: string | null;
  saved_at: string | null;
  saved_contact: string | null;
  recorded_at: string | null;
  expires_at: string;
  created_at: string;
}

const maskPhone = (p: string) => p.replace(/\d(?=\d{4})/g, "•");
const maskEmail = (e: string) => e.replace(/^(.)[^@]*(@.*)$/, "$1•••$2");
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "") || null;

export function visitTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: process.env.CHARTSIDE_TZ || "America/Chicago" }).format(new Date(iso));
}

export const contactKey = (kind: "sms" | "email", value: string) => keyedHash("pv-clinician-contact", `${kind}:${value}`);
const sameKey = (a: string | null, b: string) => !!a && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function parseContact(raw: unknown): { phone: string | null; email: string | null } {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return { phone: null, email: null };
  if (v.includes("@")) {
    if (!EMAIL.test(v) || v.length > 200) throw new Invalid("Check the email address");
    return { phone: null, email: v.toLowerCase() };
  }
  const phone = normalizePhone(v);
  if (!phone) throw new Invalid("Enter a mobile number with area code, or an email");
  return { phone, email: null };
}

export const visitMaxBytes = () => days("CHARTSIDE_VISIT_MAX_MB", 60) * 1024 * 1024;
export const ipKey = (ip: string | null | undefined) => (ip && ip !== "local" ? keyedHash("pv-ip", ip).slice(0, 32) : null);

export async function createVisit(input: { patientName?: unknown; state?: unknown; ipKey?: string | null }) {
  await purgeGuests();
  const state = String(input.state ?? "").toUpperCase();
  if (!STATE_NAMES[state]) throw new Invalid("Pick the state you're in");
  const since = new Date(Date.now() - 86400000).toISOString();
  if (input.ipKey && Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM patient_visits WHERE ip_key = ? AND created_at > ?", input.ipKey, since))?.n ?? 0) >= days("CHARTSIDE_VISIT_IP_DAILY_CAP", 30)) throw new Invalid("You've started a lot of visits today. Try again tomorrow.");
  if (Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM patient_visits WHERE created_at > ?", since))?.n ?? 0) >= days("CHARTSIDE_VISIT_DAILY_CAP", 20000)) throw new Invalid("Chartside is busy right now. Try again tomorrow.");
  const id = uid("pv_");
  const holderId = uid("usr_");
  const token = newToken();
  const expires = inDays(visitDays());
  const ts = now();
  await run("INSERT INTO users (id, email, name, password_hash, specialty, prefs, created_at, guest_expires_at) VALUES (?, ?, ?, '', 'Family Medicine', ?, ?, ?)", holderId, `${holderId}@${HOLDER_EMAIL_DOMAIN}`, "Patient's own recording", JSON.stringify({ defaultTemplate: "soap", state, patientVisit: true }), ts, expires);
  await orgs.create("Patient visit", holderId);
  await run("INSERT INTO patient_visits (id, holder_id, token_hash, status, patient_name, state, ip_key, expires_at, created_at) VALUES (?, ?, ?, 'consent', ?, ?, ?, ?, ?)", id, holderId, sha(token), clean(input.patientName, 40), state, input.ipKey ?? null, expires, ts);
  await audit.log({ id: holderId, orgId: null }, null, "patient_visit.created", { visitId: id, state });
  return { id, token };
}

export async function visitByToken(token: string) {
  if (!token || token.length > 80) return null;
  const r = await get<VisitRow>("SELECT * FROM patient_visits WHERE token_hash = ?", sha(token));
  if (!r || r.expires_at < now()) return null;
  return r;
}

async function holderOf(v: VisitRow) {
  const h = await actorFor(v.holder_id);
  if (!h) throw new Error("Visit not found");
  return h;
}

export async function recordVisitConsent(v: VisitRow, input: { decision?: unknown; clinicianName?: unknown; clinicianContact?: unknown; othersPresent?: unknown; allPartiesConfirmed?: unknown }) {
  if (v.status !== "consent") throw new Invalid(v.status === "declined" ? "The clinician already said not today" : "Consent is already on file");
  const decision = input.decision === "granted" ? "granted" : input.decision === "declined" ? "declined" : null;
  if (!decision) throw new Invalid("Tap Agree or Not today");
  const othersPresent = input.othersPresent === true;
  const allParty = ALL_PARTY_STATES.has(v.state);
  if (decision === "granted" && allParty && othersPresent && input.allPartiesConfirmed !== true) throw new Invalid(`${STATE_NAMES[v.state]} needs everyone in the room to agree before recording.`);
  const clinicianName = clean(input.clinicianName, 80);
  const contact = decision === "granted" ? parseContact(input.clinicianContact) : { phone: null, email: null };
  const holder = await holderOf(v);
  const enc = await encounters.create(holder, { scheduledAt: now(), status: decision === "granted" ? "recording" : "scheduled", patientId: null, visitType: "follow-up", reason: "Patient's own recording" });
  await recordConsent(holder, enc, { decision, method: VISIT_METHOD, state: v.state, othersPresent, clinicianName });
  if (decision === "granted") {
    await encounters.update(holder, enc.id, { status: "recording", startedAt: now() });
    await artifacts.set(enc.id, "capture_origin", { tokenId: null, userId: holder.id, channel: "patient", createdAt: now(), lastSeq: -1 });
  }
  const kind = contact.phone ? "sms" : contact.email ? "email" : null;
  const value = contact.phone ?? contact.email;
  await run("UPDATE patient_visits SET status = ?, encounter_id = ?, clinician_name = ?, clinician_contact_kind = ?, clinician_contact_hmac = ?, clinician_contact_sealed = ?, others_present = ?, offer_status = ?, recorded_at = ? WHERE id = ?", decision === "granted" ? "recording" : "declined", enc.id, clinicianName, kind, kind && value ? contactKey(kind, value) : null, value ? seal(value) : null, othersPresent ? 1 : 0, value ? "pending" : null, decision === "granted" ? now() : null, v.id);
  await audit.log(holder, enc.id, "patient_visit.consent", { visitId: v.id, decision, allParty, othersPresent, offer: !!(contact.phone || contact.email) });
  return decision;
}

export async function appendVisitAudio(v: VisitRow, input: CaptureInput) {
  if (v.status !== "recording" || !v.encounter_id) throw new Invalid(v.status === "declined" ? "Recording was declined" : v.status === "consent" ? "The clinician needs to agree first" : "This visit is already being written up");
  const holder = await holderOf(v);
  const r = await appendCapture({ user: holder, tokenId: null, limit: { bytes: visitMaxBytes(), message: TOO_LONG } }, v.encounter_id, input);
  if (r.status === "processing") await run("UPDATE patient_visits SET status = 'processing' WHERE id = ? AND status = 'recording'", v.id);
  return { status: r.status === "processing" ? "processing" : "recording", audioBytes: r.audioBytes };
}

export const TOO_LONG = "This recording reached the longest a visit can be, so we stopped here and wrote your recap from what was saved.";

export async function visitAudioBytes(v: VisitRow) {
  return v.encounter_id ? (await audioChunks.list(v.encounter_id)).reduce((n, c) => n + c.bytes, 0) : 0;
}

export async function refreshVisit(v: VisitRow): Promise<VisitRow> {
  if ((v.status !== "processing" && v.status !== "failed" && v.status !== "recording") || !v.encounter_id) return v;
  const holder = await holderOf(v);
  const enc = await encounters.get(holder, v.encounter_id);
  if (!enc) return v;
  const origin = await artifacts.get<{ error?: string }>(enc.id, "capture_origin");
  let status: VisitStatus = v.status;
  if (enc.status === "review" || enc.status === "signed") {
    await ensureRecap(holder, v);
    status = "ready";
  } else if (enc.status === "processing") status = "processing";
  else if (origin?.error && v.status !== "recording") status = "failed";
  if (status !== v.status) await run("UPDATE patient_visits SET status = ? WHERE id = ?", status, v.id);
  const fresh = { ...v, status };
  if (status === "ready" && fresh.offer_status === "pending") await sendOffer(fresh).catch(() => undefined);
  return (await get<VisitRow>("SELECT * FROM patient_visits WHERE id = ?", v.id)) ?? fresh;
}

export async function retryVisit(v: VisitRow) {
  if (v.status !== "failed" || !v.encounter_id) throw new Invalid("Nothing to retry");
  const holder = await holderOf(v);
  await encounters.update(holder, v.encounter_id, { status: "recording" });
  await run("UPDATE patient_visits SET status = 'recording' WHERE id = ?", v.id);
  return appendVisitAudio({ ...v, status: "recording" }, { audio: null, mime: null, opts: { finish: "true" } });
}

async function ensureRecap(holder: User, v: VisitRow) {
  const have = await artifacts.get<VisitRecap>(v.encounter_id!, "patient_recap");
  if (have) return have;
  const utts = await utterances.list(v.encounter_id!);
  const facts = extractFacts(utts);
  const draft = buildVisitRecap(facts, { clinician: v.clinician_name, recordedAt: new Date(v.recorded_at ?? v.created_at) });
  let recap = draft;
  if (llmEnabled() && utts.length) {
    try {
      const { readingGrade, source, ...shape } = draft;
      recap = { ...(await visitRecapWithClaude({ utterances: utts, draft: shape })), readingGrade, source: "claude" };
      void source;
    } catch {
      recap = draft;
    }
  }
  await artifacts.set(v.encounter_id!, "patient_recap", recap);
  await audit.log(holder, v.encounter_id, "patient_visit.recap", { visitId: v.id, source: recap.source });
  return recap;
}

export async function visitView(v: VisitRow, origin?: string) {
  const recap = v.status === "ready" && v.encounter_id ? await artifacts.get<VisitRecap>(v.encounter_id, "patient_recap") : null;
  const enc = v.encounter_id ? await get<{ duration_s: number | null }>("SELECT duration_s FROM encounters WHERE id = ?", v.encounter_id) : null;
  const lastSeq = v.encounter_id ? ((await artifacts.get<{ lastSeq?: number }>(v.encounter_id, "capture_origin"))?.lastSeq ?? -1) : -1;
  const bytes = v.encounter_id && v.status === "recording" ? (await audioChunks.list(v.encounter_id)).reduce((n, c) => n + c.bytes, 0) : 0;
  const utts = recap && v.encounter_id ? await utterances.list(v.encounter_id) : [];
  const offerOpen = !!v.offer_expires_at && v.offer_expires_at > now() && v.offer_status !== "claimed" && v.offer_status !== "withdrawn";
  return {
    status: v.status,
    patientName: v.patient_name,
    state: v.state,
    stateName: STATE_NAMES[v.state] ?? v.state,
    allParty: ALL_PARTY_STATES.has(v.state),
    clinicianName: v.clinician_name,
    recordedAt: v.recorded_at,
    visitTime: v.recorded_at ? visitTime(v.recorded_at) : null,
    durationS: enc?.duration_s ?? null,
    lastSeq,
    audioBytes: bytes,
    recap,
    transcript: utts.filter((u) => !u.redacted).map((u) => ({ id: u.id, speaker: u.speaker, text: u.text })),
    notes: v.notes,
    family: v.family_hash && v.family_expires_at && v.family_expires_at > now() ? { active: true, expiresAt: v.family_expires_at } : { active: false, expiresAt: null },
    offer: { status: v.offer_status === "sent" && !offerOpen ? "expired" : v.offer_status, channel: v.offer_channel, expiresAt: v.offer_expires_at, open: offerOpen },
    saved: v.saved_at ? { at: v.saved_at, contact: v.saved_contact } : null,
    expiresAt: v.expires_at,
    origin: publicOrigin(origin),
  };
}

export async function saveNotes(v: VisitRow, notes: unknown) {
  const text = typeof notes === "string" ? notes.slice(0, 5000) : "";
  await run("UPDATE patient_visits SET notes = ? WHERE id = ?", text, v.id);
  return { notes: text };
}

export async function shareWithFamily(v: VisitRow, origin?: string) {
  if (v.status !== "ready" && v.status !== "declined") throw new Invalid("Your recap isn't ready yet");
  const token = newToken();
  const expires = new Date(Math.min(Date.parse(inDays(familyDays())), Date.parse(v.expires_at))).toISOString();
  await run("UPDATE patient_visits SET family_hash = ?, family_expires_at = ? WHERE id = ?", sha(`f:${token}`), expires, v.id);
  await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.family_shared", { visitId: v.id, expiresAt: expires });
  return { url: `${publicOrigin(origin)}/visit/f/${token}`, expiresAt: expires };
}

export async function stopFamilyShare(v: VisitRow) {
  await run("UPDATE patient_visits SET family_hash = NULL, family_expires_at = NULL WHERE id = ?", v.id);
  await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.family_revoked", { visitId: v.id });
}

export async function familyView(token: string) {
  if (!token || token.length > 80) return null;
  const v = await get<VisitRow>("SELECT * FROM patient_visits WHERE family_hash = ?", sha(`f:${token}`));
  if (!v || !v.family_expires_at || v.family_expires_at < now() || v.expires_at < now()) return null;
  const recap = v.encounter_id ? await artifacts.get<VisitRecap>(v.encounter_id, "patient_recap") : null;
  await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.family_viewed", { visitId: v.id });
  return { patientName: v.patient_name, clinicianName: v.clinician_name, recordedAt: v.recorded_at ?? v.created_at, visitTime: v.recorded_at ? visitTime(v.recorded_at) : null, recap, notes: v.notes, expiresAt: v.family_expires_at };
}

export async function visitPdf(v: VisitRow) {
  const recap = v.encounter_id ? await artifacts.get<VisitRecap>(v.encounter_id, "patient_recap") : null;
  const date = new Date(v.recorded_at ?? v.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const body = recap ? recapText(recap, v.notes) : v.notes.trim() || "No notes yet.";
  return textPdf({ title: `Your visit notes, ${date}${v.clinician_name ? `, with ${v.clinician_name}` : ""}`, letterhead: "Chartside · Your own visit notes", body, footer: "Recorded by you with Chartside. This is not your medical record. Ask your clinician if anything looks wrong." });
}

export async function saveVisit(v: VisitRow, contactRaw: unknown, token: string, origin?: string) {
  const c = parseContact(contactRaw);
  const to = c.phone ?? c.email!;
  const sentToday = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM audit WHERE action = 'patient_visit.saved' AND detail LIKE ? AND created_at > ?", `%"to":"${contactTag(to)}"%`, new Date(Date.now() - 86400000).toISOString()))?.n ?? 0);
  if (sentToday >= 5) throw new Invalid("Too many links sent to that contact today. Try again tomorrow.");
  const url = `${publicOrigin(origin)}/visit/r/${token}`;
  const until = new Date(Math.max(Date.parse(v.expires_at), Date.parse(inDays(savedDays())))).toISOString();
  const body = `Your Chartside visit notes are saved until ${new Date(until).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. Open them here: ${url}`;
  if (c.phone) await sendText(c.phone, body, "patient_visit_saved");
  else {
    const r = await deliver({ channel: "email", to: c.email!, kind: "patient_visit_saved", subject: "Your Chartside visit notes", body: `${body}\n\nAnyone with this link can open your notes, so keep it private. You can delete everything from that page at any time.` });
    if (r.status !== "sent") throw new Invalid("We couldn't send the email. Try again in a minute.");
  }
  const masked = c.phone ? maskPhone(c.phone) : maskEmail(c.email!);
  await tx(async () => {
    await run("UPDATE patient_visits SET saved_at = ?, saved_contact = ?, expires_at = ? WHERE id = ?", now(), masked, until, v.id);
    await run("UPDATE users SET guest_expires_at = ? WHERE id = ?", until, v.holder_id);
  });
  await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.saved", { visitId: v.id, to: contactTag(to), channel: c.phone ? "sms" : "email", until });
  return { contact: masked, expiresAt: until };
}

export async function deleteVisit(v: VisitRow) {
  const wipe = async () => {
    const holder = await actorFor(v.holder_id);
    if (v.encounter_id) await deleteAudio(holder ?? null, v.encounter_id, "patient deleted their visit");
    const orgIds = (await all<{ org_id: string }>("SELECT org_id FROM memberships WHERE user_id = ? AND role = 'owner'", v.holder_id)).map((r) => r.org_id);
    await tx(async () => {
      await run("DELETE FROM patient_visits WHERE id = ?", v.id);
      await run("DELETE FROM encounters WHERE user_id = ?", v.holder_id);
      for (const o of orgIds) await run("DELETE FROM organizations WHERE id = ?", o);
      await run("DELETE FROM users WHERE id = ?", v.holder_id);
    });
    if (v.encounter_id) removeAudioFiles(v.encounter_id);
  };
  await (v.encounter_id ? withEncounterLock(v.encounter_id, wipe) : wipe());
  await audit.log(null, null, "patient_visit.deleted", { visitId: v.id, offerClaimed: !!v.claimed_at });
  return { deleted: true, clinicianCopy: !!v.claimed_at };
}

async function mintOffer(v: VisitRow) {
  const token = newToken();
  const expires = new Date(Math.min(Date.parse(inDays(offerDays())), Date.parse(v.expires_at))).toISOString();
  await run("UPDATE patient_visits SET offer_hash = ?, offer_expires_at = ? WHERE id = ?", sha(`o:${token}`), expires, v.id);
  return { token, expires };
}

export function offerMessage(at: string, url: string) {
  return `A patient recorded your ${visitTime(at)} visit with Chartside and offered you a draft note. Review it free: ${url}`;
}

function offerContact(v: VisitRow) {
  if (!v.clinician_contact_kind || !v.clinician_contact_sealed) return null;
  try {
    return { kind: v.clinician_contact_kind, value: unseal(v.clinician_contact_sealed) };
  } catch {
    return null;
  }
}

export const offerMode = (v: Pick<VisitRow, "clinician_contact_kind" | "clinician_contact_hmac">): "sms" | "email" | "npi" => (v.clinician_contact_hmac && v.clinician_contact_kind ? v.clinician_contact_kind : "npi");

export async function sendOffer(v: VisitRow, origin?: string) {
  const c = offerContact(v);
  if (!c || v.status !== "ready") return null;
  const to = c.value;
  const claim = await run("UPDATE patient_visits SET offer_status = 'sending' WHERE id = ? AND offer_status = 'pending'", v.id);
  if (!claim.changes) return null;
  const perDay = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM audit WHERE action = 'patient_visit.offer_sent' AND detail LIKE ? AND created_at > ?", `%"to":"${contactTag(to)}"%`, new Date(Date.now() - 86400000).toISOString()))?.n ?? 0);
  if (perDay >= days("CHARTSIDE_VISIT_OFFERS_PER_CONTACT", 5)) {
    await run("UPDATE patient_visits SET offer_status = NULL WHERE id = ?", v.id);
    await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.offer_limited", { visitId: v.id });
    return null;
  }
  const { token } = await mintOffer(v);
  const url = `${publicOrigin(origin)}/visit/c/${token}`;
  const body = offerMessage(v.recorded_at ?? v.created_at, url);
  const channel = c.kind === "sms" ? `text to ${maskPhone(to)}` : `email to ${maskEmail(to)}`;
  try {
    if (c.kind === "sms") await sendText(to, body, "patient_visit_offer");
    else {
      const r = await deliver({ channel: "email", to, kind: "patient_visit_offer", subject: "A patient offered you a draft note", body: `${body}\n\nOnly this email address can open it: we'll send a code here before you see anything. The offer ends in ${offerDays()} days. If this wasn't your visit, ignore this email.` });
      if (r.status !== "sent") throw new Error(r.error || "Email could not be sent");
    }
  } catch (err) {
    await run("UPDATE patient_visits SET offer_status = 'failed', offer_hash = NULL WHERE id = ?", v.id);
    await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.offer_failed", { visitId: v.id, error: err instanceof Error ? err.message : "error" });
    return null;
  }
  await run("UPDATE patient_visits SET offer_status = 'sent', offer_channel = ?, offer_sent_at = ?, clinician_contact_sealed = ? WHERE id = ?", channel, now(), c.kind === "sms" ? v.clinician_contact_sealed : null, v.id);
  await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.offer_sent", { visitId: v.id, channel: c.kind, to: contactTag(to) });
  await trackLoop({ loop: "patient_visit", kind: "exposure" });
  return { channel };
}

const CLEAR_CONTACT = "clinician_contact_kind = NULL, clinician_contact_hmac = NULL, clinician_contact_sealed = NULL, claim_link_id = NULL, claim_code_hash = NULL, claim_code_expires_at = NULL, claim_code_attempts = 0, claim_proof_hash = NULL";

export async function offerLink(v: VisitRow, origin?: string, clinicianNameIn?: unknown) {
  if (v.status !== "ready") throw new Invalid("Your recap isn't ready yet");
  if (v.claimed_at) throw new Invalid("Your clinician already accepted the draft");
  const clinicianName = v.clinician_name ?? clean(clinicianNameIn, 80);
  if (!clinicianName || !/[a-z]{2}/i.test(clinicianName)) throw new Invalid("Add your clinician's name first. Only someone whose NPI matches that name can open the draft.");
  const { token, expires } = await mintOffer(v);
  await run(`UPDATE patient_visits SET offer_status = 'link', offer_channel = 'a link you shared', clinician_name = ?, ${CLEAR_CONTACT} WHERE id = ?`, clinicianName, v.id);
  await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.offer_link", { visitId: v.id });
  await trackLoop({ loop: "patient_visit", kind: "exposure" });
  const url = `${publicOrigin(origin)}/visit/c/${token}`;
  return { url, expiresAt: expires, message: offerMessage(v.recorded_at ?? v.created_at, url) };
}

export async function withdrawOffer(v: VisitRow) {
  await run(`UPDATE patient_visits SET offer_hash = NULL, offer_status = 'withdrawn', clinician_phone = NULL, clinician_email = NULL, ${CLEAR_CONTACT} WHERE id = ? AND claimed_at IS NULL`, v.id);
  await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.offer_withdrawn", { visitId: v.id });
}

async function offerRow(token: string) {
  if (!token || token.length > 80) return null;
  return (await get<VisitRow>("SELECT * FROM patient_visits WHERE offer_hash = ?", sha(`o:${token}`))) ?? null;
}

export const CLAIM_COOKIE = "cs_pv_claim";
const PROOF_TTL_MS = 30 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_TRIES = 5;

function phoneProved(v: VisitRow, cookie: string | null | undefined) {
  if (!cookie || !v.claim_proof_hash) return false;
  try {
    const p = JSON.parse(unseal(cookie)) as { v?: string; n?: string; exp?: number };
    return p.v === v.id && typeof p.n === "string" && typeof p.exp === "number" && p.exp > Date.now() && sameKey(v.claim_proof_hash, sha(`p:${p.n}`));
  } catch {
    return false;
  }
}

async function emailProved(v: VisitRow, user: User) {
  if (!v.claim_link_id || !sameKey(v.clinician_contact_hmac, contactKey("email", user.email.toLowerCase()))) return false;
  return !!(await get<{ id: string }>("SELECT id FROM magic_links WHERE id = ? AND kind = 'email' AND email = ? AND used_at IS NOT NULL AND used_at > ?", v.claim_link_id, user.email.toLowerCase(), new Date(Date.now() - PROOF_TTL_MS).toISOString()));
}

async function canClaim(v: VisitRow, user: User | null, cookie?: string | null) {
  if (!user || user.guestUntil) return false;
  const mode = offerMode(v);
  if (mode === "email") return emailProved(v, user);
  if (mode === "sms") return phoneProved(v, cookie);
  return false;
}

const maskedHint = (v: VisitRow) => {
  const c = offerContact(v);
  if (offerMode(v) === "sms") return c ? `the number ending in ${c.value.slice(-4)}` : "the clinician's mobile";
  return v.offer_channel?.replace(/^email to /, "") ?? "the clinician's email";
};

export async function offerInfo(token: string, ctx: { user?: User | null; cookie?: string | null } = {}) {
  const v = await offerRow(token);
  if (!v) return { state: "missing" as const };
  if (v.claimed_at) return { state: "claimed" as const };
  if (!v.offer_expires_at || v.offer_expires_at < now() || v.expires_at < now() || v.status !== "ready") return { state: "expired" as const };
  const mode = offerMode(v);
  return {
    state: "open" as const,
    visitTime: visitTime(v.recorded_at ?? v.created_at),
    date: new Date(v.recorded_at ?? v.created_at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    clinicianName: v.clinician_name,
    mode,
    sentTo: mode === "npi" ? null : maskedHint(v),
    phoneConfirmed: mode === "sms" && phoneProved(v, ctx.cookie),
    ready: await canClaim(v, ctx.user ?? null, ctx.cookie),
    expiresAt: v.offer_expires_at,
  };
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");

export function nameMatches(given: string | null, last: string) {
  if (!given) return false;
  const want = norm(last);
  return !!want && given.split(/[\s,.]+/).map(norm).filter(Boolean).includes(want);
}

const ENDED = "This offer has ended. Ask the patient to send a new one.";

async function openOffer(token: string) {
  const v = await offerRow(token);
  if (!v || v.claimed_at || !v.offer_expires_at || v.offer_expires_at < now() || v.expires_at < now() || v.status !== "ready" || !v.encounter_id) throw new Invalid(ENDED);
  return v;
}

export async function requestOfferEmailCode(token: string, emailIn: unknown, opts: { origin?: string; guestUserId?: string | null } = {}) {
  const v = await openOffer(token);
  if (offerMode(v) !== "email") throw new Invalid(offerMode(v) === "sms" ? "This draft was offered by text. Use Text me a code." : "Confirm with your NPI to open this draft.");
  const email = (typeof emailIn === "string" ? emailIn : "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) throw new Invalid("Enter a valid email address");
  if (limited(`pv-email:${v.id}`, 20, 3600000)) throw new Invalid("Too many tries. Ask the patient to send the offer again.");
  if (!sameKey(v.clinician_contact_hmac, contactKey("email", email))) {
    await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.claim_email_refused", { visitId: v.id });
    throw new Invalid("That isn't the email this draft was offered to. Use the address the offer came to.");
  }
  const r = await requestEmailSignIn(email, { next: `/visit/c/${token}`, origin: opts.origin, guestUserId: opts.guestUserId ?? null });
  const link = await get<{ id: string }>("SELECT id FROM magic_links WHERE email = ? AND kind = 'email' ORDER BY created_at DESC LIMIT 1", email);
  await run("UPDATE patient_visits SET claim_link_id = ? WHERE id = ?", link?.id ?? null, v.id);
  await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.claim_email_sent", { visitId: v.id });
  return r;
}

export async function sendOfferTextCode(token: string) {
  const v = await openOffer(token);
  if (offerMode(v) !== "sms") throw new Invalid(offerMode(v) === "email" ? "This draft was offered by email. Use Email me a code." : "Confirm with your NPI to open this draft.");
  const c = offerContact(v);
  if (!c) throw new Invalid(ENDED);
  if (v.claim_code_sent_at && Date.now() - Date.parse(v.claim_code_sent_at) < 30000) throw new Invalid("A code was just sent. Wait 30 seconds before asking again.");
  const sent = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM audit WHERE action = 'patient_visit.claim_code_sent' AND detail LIKE ? AND created_at > ?", `%"visitId":"${v.id}"%`, new Date(Date.now() - 3600000).toISOString()))?.n ?? 0);
  if (sent >= 5) throw new Invalid("Too many codes requested. Try again in an hour.");
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  await run("UPDATE patient_visits SET claim_code_hash = ?, claim_code_expires_at = ?, claim_code_attempts = 0, claim_code_sent_at = ? WHERE id = ?", sha(`c:${v.id}:${code}`), new Date(Date.now() + CODE_TTL_MS).toISOString(), now(), v.id);
  try {
    await sendText(c.value, `Your Chartside code is ${code}. It expires in 10 minutes. Didn't ask for it? Ignore this text.`, "patient_visit_claim_code");
  } catch {
    await run("UPDATE patient_visits SET claim_code_hash = NULL WHERE id = ?", v.id);
    throw new Invalid("We couldn't text that number. Ask the patient to send the offer again.");
  }
  await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.claim_code_sent", { visitId: v.id });
  return { sentTo: maskedHint(v) };
}

export async function checkOfferTextCode(token: string, codeIn: unknown) {
  const v = await openOffer(token);
  if (offerMode(v) !== "sms") throw new Invalid("Use the way this offer reached you to confirm");
  if (!v.claim_code_hash || !v.claim_code_expires_at || v.claim_code_expires_at < now()) throw new Invalid("That code expired. Ask for a new one.");
  if (v.claim_code_attempts >= MAX_CODE_TRIES) throw new Invalid("Too many tries. Ask for a new code.");
  const code = String(codeIn ?? "").trim();
  if (!sameKey(v.claim_code_hash, sha(`c:${v.id}:${code}`))) {
    await run("UPDATE patient_visits SET claim_code_attempts = claim_code_attempts + 1 WHERE id = ?", v.id);
    throw new Invalid(v.claim_code_attempts + 1 >= MAX_CODE_TRIES ? "Too many tries. Ask for a new code." : "That code isn't right");
  }
  const n = randomBytes(18).toString("base64url");
  const used = await run("UPDATE patient_visits SET claim_code_hash = NULL, claim_proof_hash = ? WHERE id = ? AND claim_code_hash = ?", sha(`p:${n}`), v.id, v.claim_code_hash);
  if (!used.changes) throw new Invalid("That code was already used. Ask for a new one.");
  await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.claim_phone_confirmed", { visitId: v.id });
  return { cookie: seal(JSON.stringify({ v: v.id, n, exp: Date.now() + PROOF_TTL_MS })), maxAge: PROOF_TTL_MS / 1000 };
}

export async function claimOffer(clinician: User, token: string, proof: { cookie?: string | null } = {}) {
  const v = await openOffer(token);
  const mode = offerMode(v);
  if (mode === "npi") throw new Forbidden("The patient shared this link themselves. Confirm with your NPI to open the draft.");
  if (clinician.guestUntil) throw new Forbidden("Sign in or make your free account first");
  if (mode === "email" && !(await emailProved(v, clinician))) throw new Forbidden("Confirm with the code we email to the address this draft was offered to");
  if (mode === "sms" && !phoneProved(v, proof.cookie)) throw new Forbidden("Confirm with the code we text to the number this draft was offered to");
  return finishClaim(clinician, v, token);
}

async function finishClaim(clinician: User, v: VisitRow, token: string) {
  const taken = await run("UPDATE patient_visits SET claimed_at = ?, claimed_by = ?, offer_status = 'claimed', offer_hash = NULL WHERE id = ? AND claimed_at IS NULL AND offer_hash = ?", now(), clinician.id, v.id, sha(`o:${token}`));
  if (!taken.changes) throw new Invalid(ENDED);
  try {
    const encId = await copyToClinician(clinician, v);
    await run(`UPDATE patient_visits SET claimed_encounter_id = ?, ${CLEAR_CONTACT} WHERE id = ?`, encId, v.id);
    await audit.log(clinician, encId, "patient_visit.claimed", { visitId: v.id, via: offerMode(v) });
    return { encounterId: encId, next: `/go/stack?focus=${encId}` };
  } catch (err) {
    await run("UPDATE patient_visits SET claimed_at = NULL, claimed_by = NULL, offer_status = ?, offer_hash = ? WHERE id = ?", v.offer_status, sha(`o:${token}`), v.id);
    throw err;
  }
}

async function copyToClinician(clinician: User, v: VisitRow) {
  const holder = await holderOf(v);
  const src = (await encounters.get(holder, v.encounter_id!))!;
  const utts = await utterances.list(src.id);
  if (!utts.length) throw new Invalid("This recording has no conversation in it");
  const consent = await consents.latest(src.id);
  const at = v.recorded_at ?? src.startedAt ?? src.scheduledAt;
  const enc = await encounters.create(clinician, { scheduledAt: at, status: "recording", patientId: null, visitType: "follow-up", reason: "" });
  await encounters.update(clinician, enc.id, { startedAt: at, endedAt: src.endedAt ?? now(), ...(src.durationS ? { durationS: src.durationS } : {}) });
  await utterances.append(enc.id, utts.map(({ id: _id, seq: _seq, ...u }) => ({ ...u, source: "final" as const })));
  if (consent) await consents.add({ encounterId: enc.id, userId: clinician.id, decision: consent.decision, method: consent.method, state: consent.state, allParty: consent.allParty, othersPresent: consent.othersPresent, scriptVersion: consent.scriptVersion, statement: consent.statement, digest: consent.digest });
  await artifacts.set(enc.id, "capture_origin", { tokenId: null, userId: clinician.id, channel: "patient", createdAt: now(), finishedAt: now() });
  await artifacts.set(enc.id, "patient_recording", { label: PATIENT_LABEL, recordedAt: at, clinicianNameGiven: v.clinician_name, consentDigest: consent?.digest ?? null, state: v.state });
  await processEncounter(clinician, enc.id);
  return enc.id;
}

export async function claimWithNpi(token: string, input: { npi?: unknown; state?: unknown }, current: User | null = null) {
  const v = await openOffer(token);
  if (offerMode(v) !== "npi") throw new Invalid("This draft was offered to a phone or email. Confirm with the code sent there.");
  if (!v.clinician_name) throw new Invalid("The patient didn't give a clinician name, so this link can't be opened. Ask them for a new one.");
  const rec = await lookupNpi(String(input.npi ?? ""));
  if (!rec) throw new Invalid("No individual clinician has that NPI");
  if (!nameMatches(v.clinician_name, rec.last)) {
    await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.claim_npi_refused", { visitId: v.id });
    throw new Invalid("That NPI doesn't match the name the patient entered.");
  }
  const state = String(input.state ?? "").toUpperCase();
  if (!state || state !== rec.state) throw new Invalid("That state doesn't match the NPI registry.");
  let user: User;
  if (current) {
    const mine = current.prefs.npi;
    if (mine?.matched && mine.number !== rec.number) throw new Invalid("Your account has a different NPI on file.");
    if (!mine?.matched || mine.number !== rec.number) {
      const r = await claimNpi(current, { npi: rec.number, state, applyName: !!current.guestUntil });
      if (!r.matched) throw new Invalid(r.reason ?? "We couldn't confirm that NPI.");
    }
    user = (await actorFor(current.id))!;
  } else {
    const guest = await createGuest({ loop: "patient_visit" });
    const r = await claimNpi(guest, { npi: rec.number, state, applyName: true });
    if (!r.matched) throw new Invalid(r.reason ?? "We couldn't confirm that NPI.");
    user = (await actorFor(guest.id))!;
  }
  return { user, created: !current, ...(await finishClaim(user, v, token)) };
}

export async function visitLoopClick(visitor: string | null) {
  await trackLoop({ loop: "patient_visit", kind: "click", visitor });
}

type Ctx<P> = { params: Promise<P> };

export function visitError(err: unknown) {
  if (err instanceof CaptureAuthError) return fail(err.message, err.status);
  const message = err instanceof Error ? err.message : "Unexpected error";
  const status = err instanceof Forbidden ? 403 : err instanceof Invalid ? (/already|isn't ready|being written/.test(message) ? 409 : 422) : /not found/i.test(message) ? 404 : 500;
  if (status === 500) console.error(err);
  return fail(status === 500 ? "Something went wrong. Try again in a minute." : message, status);
}

export function visitRoute(handler: (req: Request, v: VisitRow, token: string) => Promise<Response>) {
  return async (req: Request, ctx: Ctx<{ token: string }>) => {
    try {
      const { token } = await ctx.params;
      const v = await visitByToken(token);
      if (!v) return fail("This visit link has expired or was deleted", 404);
      return await handler(req, v, token);
    } catch (err) {
      return visitError(err);
    }
  };
}
