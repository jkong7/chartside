import { createHash, randomBytes } from "node:crypto";
import { all, get, now, run, tx, uid } from "../db";
import { ALL_PARTY_STATES, STATE_NAMES } from "../engine/lexicon";
import { extractFacts } from "../engine/extract";
import { buildVisitRecap, recapText, type VisitRecap } from "../engine/visitRecap";
import { llmEnabled, visitRecapWithClaude } from "../llm";
import { textPdf } from "../pdf";
import type { ConsentRecord } from "../types";
import { deleteAudio } from "./audio";
import { appendCapture, type CaptureInput } from "./capture";
import { CaptureAuthError } from "./captureTokens";
import { fail } from "./http";
import { deliver } from "./delivery";
import { claimNpi, lookupNpi } from "./growth";
import { createGuest, purgeGuests } from "./guest";
import { trackLoop } from "./loops";
import { publicOrigin } from "./magic";
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

export async function createVisit(input: { patientName?: unknown; state?: unknown; ipKey?: string | null }) {
  await purgeGuests();
  const state = String(input.state ?? "").toUpperCase();
  if (!STATE_NAMES[state]) throw new Invalid("Pick the state you're in");
  const cap = days("CHARTSIDE_VISIT_DAILY_CAP", 500);
  if (Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM patient_visits WHERE created_at > ?", new Date(Date.now() - 86400000).toISOString()))?.n ?? 0) >= cap) throw new Invalid("Chartside is busy right now. Try again tomorrow.");
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
  await run("UPDATE patient_visits SET status = ?, encounter_id = ?, clinician_name = ?, clinician_phone = ?, clinician_email = ?, others_present = ?, offer_status = ?, recorded_at = ? WHERE id = ?", decision === "granted" ? "recording" : "declined", enc.id, clinicianName, contact.phone, contact.email, othersPresent ? 1 : 0, contact.phone || contact.email ? "pending" : null, decision === "granted" ? now() : null, v.id);
  await audit.log(holder, enc.id, "patient_visit.consent", { visitId: v.id, decision, allParty, othersPresent, offer: !!(contact.phone || contact.email) });
  return decision;
}

export async function appendVisitAudio(v: VisitRow, input: CaptureInput) {
  if (v.status !== "recording" || !v.encounter_id) throw new Invalid(v.status === "declined" ? "Recording was declined" : v.status === "consent" ? "The clinician needs to agree first" : "This visit is already being written up");
  const holder = await holderOf(v);
  const r = await appendCapture({ user: holder, tokenId: null }, v.encounter_id, input);
  if (r.status === "processing") await run("UPDATE patient_visits SET status = 'processing' WHERE id = ? AND status = 'recording'", v.id);
  return { status: r.status === "processing" ? "processing" : "recording", audioBytes: r.audioBytes };
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
  const sentToday = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM audit WHERE action = 'patient_visit.saved' AND detail LIKE ? AND created_at > ?", `%"to":"${sha(to).slice(0, 16)}"%`, new Date(Date.now() - 86400000).toISOString()))?.n ?? 0);
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
  await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.saved", { visitId: v.id, to: sha(to).slice(0, 16), channel: c.phone ? "sms" : "email", until });
  return { contact: masked, expiresAt: until };
}

export async function deleteVisit(v: VisitRow) {
  const holder = await actorFor(v.holder_id);
  if (v.encounter_id) await deleteAudio(holder ?? null, v.encounter_id, "patient deleted their visit");
  const orgIds = (await all<{ org_id: string }>("SELECT org_id FROM memberships WHERE user_id = ? AND role = 'owner'", v.holder_id)).map((r) => r.org_id);
  await tx(async () => {
    await run("DELETE FROM patient_visits WHERE id = ?", v.id);
    await run("DELETE FROM encounters WHERE user_id = ?", v.holder_id);
    for (const o of orgIds) await run("DELETE FROM organizations WHERE id = ?", o);
    await run("DELETE FROM users WHERE id = ?", v.holder_id);
  });
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

export async function sendOffer(v: VisitRow, origin?: string) {
  const to = v.clinician_phone ?? v.clinician_email;
  if (!to || v.status !== "ready") return null;
  const claim = await run("UPDATE patient_visits SET offer_status = 'sending' WHERE id = ? AND offer_status = 'pending'", v.id);
  if (!claim.changes) return null;
  const perDay = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM audit WHERE action = 'patient_visit.offer_sent' AND detail LIKE ? AND created_at > ?", `%"to":"${sha(to).slice(0, 16)}"%`, new Date(Date.now() - 86400000).toISOString()))?.n ?? 0);
  if (perDay >= days("CHARTSIDE_VISIT_OFFERS_PER_CONTACT", 5)) {
    await run("UPDATE patient_visits SET offer_status = NULL WHERE id = ?", v.id);
    await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.offer_limited", { visitId: v.id });
    return null;
  }
  const { token } = await mintOffer(v);
  const url = `${publicOrigin(origin)}/visit/c/${token}`;
  const body = offerMessage(v.recorded_at ?? v.created_at, url);
  const channel = v.clinician_phone ? `text to ${maskPhone(v.clinician_phone)}` : `email to ${maskEmail(v.clinician_email!)}`;
  try {
    if (v.clinician_phone) await sendText(v.clinician_phone, body, "patient_visit_offer");
    else {
      const r = await deliver({ channel: "email", to: v.clinician_email!, kind: "patient_visit_offer", subject: "A patient offered you a draft note", body: `${body}\n\nYou'll confirm who you are before you see anything. The offer ends in ${offerDays()} days. If this wasn't your visit, ignore this email.` });
      if (r.status !== "sent") throw new Error(r.error || "Email could not be sent");
    }
  } catch (err) {
    await run("UPDATE patient_visits SET offer_status = 'failed', offer_hash = NULL WHERE id = ?", v.id);
    await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.offer_failed", { visitId: v.id, error: err instanceof Error ? err.message : "error" });
    return null;
  }
  await run("UPDATE patient_visits SET offer_status = 'sent', offer_channel = ?, offer_sent_at = ?, clinician_phone = NULL, clinician_email = NULL WHERE id = ?", channel, now(), v.id);
  await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.offer_sent", { visitId: v.id, channel: v.clinician_phone ? "sms" : "email", to: sha(to).slice(0, 16) });
  await trackLoop({ loop: "patient_visit", kind: "exposure" });
  return { channel };
}

export async function offerLink(v: VisitRow, origin?: string) {
  if (v.status !== "ready") throw new Invalid("Your recap isn't ready yet");
  if (v.claimed_at) throw new Invalid("Your clinician already accepted the draft");
  const { token, expires } = await mintOffer(v);
  await run("UPDATE patient_visits SET offer_status = 'link', offer_channel = 'a link you shared' WHERE id = ?", v.id);
  await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.offer_link", { visitId: v.id });
  await trackLoop({ loop: "patient_visit", kind: "exposure" });
  const url = `${publicOrigin(origin)}/visit/c/${token}`;
  return { url, expiresAt: expires, message: offerMessage(v.recorded_at ?? v.created_at, url) };
}

export async function withdrawOffer(v: VisitRow) {
  await run("UPDATE patient_visits SET offer_hash = NULL, offer_status = 'withdrawn', clinician_phone = NULL, clinician_email = NULL WHERE id = ? AND claimed_at IS NULL", v.id);
  await audit.log({ id: v.holder_id, orgId: null }, null, "patient_visit.offer_withdrawn", { visitId: v.id });
}

async function offerRow(token: string) {
  if (!token || token.length > 80) return null;
  return (await get<VisitRow>("SELECT * FROM patient_visits WHERE offer_hash = ?", sha(`o:${token}`))) ?? null;
}

export async function offerInfo(token: string) {
  const v = await offerRow(token);
  if (!v) return { state: "missing" as const };
  if (v.claimed_at) return { state: "claimed" as const };
  if (!v.offer_expires_at || v.offer_expires_at < now() || v.expires_at < now() || v.status !== "ready") return { state: "expired" as const };
  return { state: "open" as const, visitTime: visitTime(v.recorded_at ?? v.created_at), date: new Date(v.recorded_at ?? v.created_at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }), clinicianName: v.clinician_name, npiAllowed: !!v.clinician_name, expiresAt: v.offer_expires_at };
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");

export function nameMatches(given: string | null, last: string) {
  if (!given) return false;
  const want = norm(last);
  return !!want && given.split(/[\s,.]+/).map(norm).filter(Boolean).includes(want);
}

async function openOffer(token: string) {
  const v = await offerRow(token);
  if (!v || v.claimed_at || !v.offer_expires_at || v.offer_expires_at < now() || v.expires_at < now() || v.status !== "ready" || !v.encounter_id) throw new Invalid("This offer has ended. Ask the patient to send a new one.");
  return v;
}

export async function claimOffer(clinician: User, token: string) {
  if (clinician.guestUntil && !clinician.prefs.npi?.matched) throw new Forbidden("Confirm who you are first, with your email or NPI");
  const v = await openOffer(token);
  const taken = await run("UPDATE patient_visits SET claimed_at = ?, claimed_by = ?, offer_status = 'claimed', offer_hash = NULL WHERE id = ? AND claimed_at IS NULL", now(), clinician.id, v.id);
  if (!taken.changes) throw new Invalid("This offer has ended. Ask the patient to send a new one.");
  try {
    const encId = await copyToClinician(clinician, v);
    await run("UPDATE patient_visits SET claimed_encounter_id = ? WHERE id = ?", encId, v.id);
    await audit.log(clinician, encId, "patient_visit.claimed", { visitId: v.id });
    return { encounterId: encId, next: `/go/stack?focus=${encId}` };
  } catch (err) {
    await run("UPDATE patient_visits SET claimed_at = NULL, claimed_by = NULL, offer_status = 'sent', offer_hash = ? WHERE id = ?", sha(`o:${token}`), v.id);
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
  const enc = await encounters.create(clinician, { scheduledAt: at, status: "recording", patientId: null, visitType: "follow-up", reason: PATIENT_LABEL });
  await encounters.update(clinician, enc.id, { startedAt: at, endedAt: src.endedAt ?? now(), ...(src.durationS ? { durationS: src.durationS } : {}) });
  await utterances.append(enc.id, utts.map(({ id: _id, seq: _seq, ...u }) => ({ ...u, source: "final" as const })));
  if (consent) await consents.add({ encounterId: enc.id, userId: clinician.id, decision: consent.decision, method: consent.method, state: consent.state, allParty: consent.allParty, othersPresent: consent.othersPresent, scriptVersion: consent.scriptVersion, statement: consent.statement, digest: consent.digest });
  await artifacts.set(enc.id, "capture_origin", { tokenId: null, userId: clinician.id, channel: "patient", createdAt: now(), finishedAt: now() });
  await artifacts.set(enc.id, "patient_recording", { label: PATIENT_LABEL, recordedAt: at, clinicianNameGiven: v.clinician_name, consentDigest: consent?.digest ?? null, state: v.state });
  await processEncounter(clinician, enc.id);
  return enc.id;
}

export async function claimWithNpi(token: string, input: { npi?: unknown; state?: unknown }) {
  const v = await openOffer(token);
  if (!v.clinician_name) throw new Invalid("Use your email to confirm who you are");
  const rec = await lookupNpi(String(input.npi ?? ""));
  if (!rec) throw new Invalid("No individual clinician has that NPI");
  if (!nameMatches(v.clinician_name, rec.last)) throw new Invalid("That NPI doesn't match the name the patient entered. Use your email instead.");
  const state = String(input.state ?? "").toUpperCase();
  if (!state || state !== rec.state) throw new Invalid("That state doesn't match the NPI registry. Use your email instead.");
  const guest = await createGuest({ loop: "patient_visit" });
  const r = await claimNpi(guest, { npi: rec.number, state, applyName: true });
  if (!r.matched) throw new Invalid(r.reason ?? "We couldn't confirm that NPI. Use your email instead.");
  const fresh = (await actorFor(guest.id))!;
  return { user: fresh, ...(await claimOffer(fresh, token)) };
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
