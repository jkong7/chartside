import { all, get, now, run, uid } from "../db";
import { pkcePair, randomState, seal, unseal } from "../fhir/crypto";
import { buildChart, buildDocumentReference, mapEncounter, mapPatient, type FhirBundle, type FhirResource } from "../fhir/mapping";
import { authorizeUrl, discover, exchangeCode, fhirRequest, fhirUserOf, normalizeIss, refreshToken, type TokenResponse } from "../fhir/smart";
import type { Encounter } from "../types";
import { noteText } from "./pipeline";
import { artifacts, audit, consents, encounters, notes, patients, users, type User } from "./repo";

export const EPIC_SANDBOX = "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4";

export function ehrConfig() {
  const clientId = process.env.SMART_CLIENT_ID || "";
  const defaultIss = normalizeIss(process.env.SMART_ISS || EPIC_SANDBOX);
  const allowed = new Set([defaultIss, ...(process.env.SMART_ALLOWED_ISS ?? "").split(",").map((s) => s.trim()).filter(Boolean).map(normalizeIss)]);
  return {
    configured: !!clientId,
    clientId,
    clientSecret: process.env.SMART_CLIENT_SECRET || undefined,
    defaultIss,
    allowed,
    ehrScope: process.env.SMART_SCOPE_EHR || "launch openid fhirUser user/Patient.read user/Condition.read user/MedicationRequest.read user/AllergyIntolerance.read user/Observation.read user/Encounter.read user/DocumentReference.write",
    standaloneScope: process.env.SMART_SCOPE_STANDALONE || "launch/patient openid fhirUser patient/Patient.read patient/Condition.read patient/MedicationRequest.read patient/AllergyIntolerance.read patient/Observation.read patient/Encounter.read patient/DocumentReference.write",
    label: process.env.SMART_LABEL || (defaultIss === EPIC_SANDBOX ? "Epic sandbox" : "EHR"),
  };
}

export function issAllowed(iss: string) {
  return ehrConfig().allowed.has(normalizeIss(iss));
}

export function systemLabel(iss: string) {
  const cfg = ehrConfig();
  if (normalizeIss(iss) === EPIC_SANDBOX) return "Epic";
  if (normalizeIss(iss) === cfg.defaultIss) return cfg.label;
  try {
    return new URL(iss).hostname.includes("epic") ? "Epic" : "EHR";
  } catch {
    return "EHR";
  }
}

export async function startLaunch(user: User, input: { iss: string; launch?: string; redirectUri: string }) {
  const cfg = ehrConfig();
  if (!cfg.configured) throw new Error("SMART_CLIENT_ID is not set. Register Chartside as an app with the EHR and set SMART_CLIENT_ID.");
  const iss = normalizeIss(input.iss);
  if (!issAllowed(iss)) throw new Error(`The EHR at ${iss} is not on the allowed list (SMART_ALLOWED_ISS).`);
  const smart = await discover(iss);
  const { verifier, challenge } = pkcePair();
  const state = randomState();
  await run("DELETE FROM smart_launches WHERE created_at < ?", new Date(Date.now() - 15 * 60000).toISOString());
  await run("INSERT INTO smart_launches (state, user_id, iss, launch, verifier, token_endpoint, redirect_uri, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", state, user.id, iss, input.launch ?? null, verifier, smart.token_endpoint, input.redirectUri, now());
  await audit.log(user, null, input.launch ? "ehr.launch" : "ehr.connect", { iss });
  return authorizeUrl(smart, { clientId: cfg.clientId, redirectUri: input.redirectUri, scope: input.launch ? cfg.ehrScope : cfg.standaloneScope, state, aud: iss, challenge, launch: input.launch });
}

interface ConnRow {
  id: string;
  user_id: string;
  iss: string;
  token_endpoint: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  scope: string;
  patient: string | null;
  encounter: string | null;
  fhir_user: string | null;
  created_at: string;
  updated_at: string;
}

export interface Connection {
  id: string;
  iss: string;
  scope: string;
  patient: string | null;
  encounter: string | null;
  fhirUser: string | null;
  expiresAt: string;
  hasRefresh: boolean;
  createdAt: string;
}

const toConn = (r: ConnRow): Connection => ({ id: r.id, iss: r.iss, scope: r.scope, patient: r.patient, encounter: r.encounter, fhirUser: r.fhir_user, expiresAt: r.expires_at, hasRefresh: !!r.refresh_token, createdAt: r.created_at });

export const connections = {
  list: async (userId: string) => (await all<ConnRow>("SELECT * FROM ehr_connections WHERE user_id = ? ORDER BY updated_at DESC", userId)).map(toConn),
  get: async (userId: string, id: string) => {
    const r = await get<ConnRow>("SELECT * FROM ehr_connections WHERE user_id = ? AND id = ?", userId, id);
    return r ? toConn(r) : undefined;
  },
  latestFor: async (userId: string, iss: string) => {
    const r = await get<ConnRow>("SELECT * FROM ehr_connections WHERE user_id = ? AND iss = ? ORDER BY updated_at DESC LIMIT 1", userId, normalizeIss(iss));
    return r ? toConn(r) : undefined;
  },
  remove: (userId: string, id: string) => run("DELETE FROM ehr_connections WHERE user_id = ? AND id = ?", userId, id),
};

async function saveConnection(userId: string, iss: string, tokenEndpoint: string, t: TokenResponse, existingId?: string) {
  const id = existingId ?? uid("ehr_");
  const expires = new Date(Date.now() + (t.expires_in ?? 3600) * 1000 - 30000).toISOString();
  const refresh = t.refresh_token ? seal(t.refresh_token) : null;
  if (existingId) {
    await run("UPDATE ehr_connections SET access_token = ?, refresh_token = COALESCE(?, refresh_token), expires_at = ?, scope = COALESCE(?, scope), updated_at = ? WHERE id = ?", seal(t.access_token), refresh, expires, t.scope ?? null, now(), id);
  } else {
    await run(
      "INSERT INTO ehr_connections (id, user_id, iss, token_endpoint, access_token, refresh_token, expires_at, scope, patient, encounter, fhir_user, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, userId, iss, tokenEndpoint, seal(t.access_token), refresh, expires, t.scope ?? "", t.patient ?? null, t.encounter ?? null, fhirUserOf(t), now(), now(),
    );
  }
  return id;
}

export async function accessToken(userId: string, connId: string) {
  const r = await get<ConnRow>("SELECT * FROM ehr_connections WHERE user_id = ? AND id = ?", userId, connId);
  if (!r) throw new Error("EHR connection not found");
  if (new Date(r.expires_at) > new Date()) return { token: unseal(r.access_token), iss: r.iss };
  if (!r.refresh_token) throw new Error("The EHR session expired. Relaunch Chartside from the EHR to reconnect.");
  const cfg = ehrConfig();
  const t = await refreshToken(r.token_endpoint, { refreshToken: unseal(r.refresh_token), clientId: cfg.clientId, clientSecret: cfg.clientSecret });
  await saveConnection(userId, r.iss, r.token_endpoint, t, r.id);
  await audit.log({ id: userId, orgId: null }, null, "ehr.token_refreshed", { iss: r.iss });
  return { token: t.access_token, iss: r.iss };
}

async function search(iss: string, token: string, path: string): Promise<FhirBundle> {
  try {
    return (await fhirRequest<FhirBundle>(iss, token, path)).data ?? { resourceType: "Bundle", entry: [] };
  } catch {
    return { resourceType: "Bundle", entry: [] };
  }
}

export async function importPatient(user: User, connId: string, fhirPatientId: string) {
  const { token, iss } = await accessToken(user.id, connId);
  const q = encodeURIComponent(fhirPatientId);
  const [pat, conditions, meds, allergies, labs, vitals] = await Promise.all([
    fhirRequest<FhirResource>(iss, token, `Patient/${q}`).then((r) => r.data),
    search(iss, token, `Condition?patient=${q}&category=problem-list-item`),
    search(iss, token, `MedicationRequest?patient=${q}&status=active`),
    search(iss, token, `AllergyIntolerance?patient=${q}`),
    search(iss, token, `Observation?patient=${q}&category=laboratory`),
    search(iss, token, `Observation?patient=${q}&category=vital-signs`),
  ]);
  if (!(conditions.entry ?? []).length) {
    const any = await search(iss, token, `Condition?patient=${q}&clinical-status=active`);
    conditions.entry = any.entry ?? [];
  }
  const demo = mapPatient(pat);
  const existing = await patients.byExternal(user, iss, fhirPatientId);
  const chart = buildChart({ conditions, meds, allergies, labs, vitals }, existing?.chart);
  let patient = existing;
  if (patient) {
    await patients.link(user, patient.id, iss, fhirPatientId, demo);
    await patients.updateChart(user, patient.id, chart);
  } else {
    patient = await patients.create(user, { ...demo, pronouns: "", chart });
    await patients.link(user, patient.id, iss, fhirPatientId, demo);
  }
  await audit.log(user, null, "ehr.imported", { iss, problems: chart.problems.length, medications: chart.medications.length, allergies: chart.allergies.length, labs: chart.labs?.length ?? 0 });
  return (await patients.get(user, patient.id))!;
}

export async function completeLaunch(user: User, state: string, code: string) {
  const row = await get<{ state: string; user_id: string; iss: string; launch: string | null; verifier: string; token_endpoint: string; redirect_uri: string; created_at: string }>("SELECT * FROM smart_launches WHERE state = ?", state);
  await run("DELETE FROM smart_launches WHERE state = ?", state);
  if (!row || row.user_id !== user.id) throw new Error("This sign-in link has expired. Start the launch again.");
  if (Date.now() - new Date(row.created_at).getTime() > 15 * 60000) throw new Error("The launch took too long. Start it again.");
  const cfg = ehrConfig();
  const t = await exchangeCode(row.token_endpoint, { code, redirectUri: row.redirect_uri, clientId: cfg.clientId, clientSecret: cfg.clientSecret, verifier: row.verifier });
  const connId = await saveConnection(user.id, row.iss, row.token_endpoint, t);
  await audit.log(user, null, "ehr.connected", { iss: row.iss, patient: t.patient ?? null, encounter: t.encounter ?? null, scope: t.scope ?? "" });
  if (!t.patient) return { connectionId: connId, encounterId: null as string | null };
  const patient = await importPatient(user, connId, t.patient);
  let enc: Encounter | undefined;
  const { token, iss } = await accessToken(user.id, connId);
  let started = new Date().toISOString();
  let reason = "";
  let telehealth = false;
  if (t.encounter) {
    enc = await encounters.byExternal(user, iss, t.encounter);
    try {
      const e = await fhirRequest<FhirResource>(iss, token, `Encounter/${encodeURIComponent(t.encounter)}`);
      const m = mapEncounter(e.data);
      started = m.start ?? started;
      reason = m.reason;
      telehealth = m.telehealth;
    } catch {
      reason = "";
    }
  }
  if (!enc) {
    enc = await encounters.create(user, { patientId: patient.id, scheduledAt: started, reason, visitType: "follow-up", templateId: user.prefs.defaultTemplate ?? "soap", setting: telehealth ? "telehealth" : "in-person", outputLang: patient.language !== "en" ? patient.language : "en" });
    if (t.encounter) await encounters.link(user, enc.id, iss, t.encounter);
  }
  await artifacts.set(enc.id, "ehr_link", { connectionId: connId, connectionOwner: user.id, iss, patient: t.patient, encounter: t.encounter ?? null, fhirUser: fhirUserOf(t), system: systemLabel(iss) });
  await audit.log(user, enc.id, "ehr.context", { iss, patient: t.patient, encounter: t.encounter ?? null });
  return { connectionId: connId, encounterId: enc.id };
}

export interface EhrLink {
  connectionId: string;
  connectionOwner?: string;
  iss: string;
  patient: string;
  encounter: string | null;
  fhirUser: string | null;
  system: string;
}

export interface EhrFiling {
  status: "filed" | "error";
  at: string;
  reference?: string;
  message?: string;
}

export async function fileNote(user: User, encId: string): Promise<EhrFiling> {
  const enc = await encounters.get(user, encId);
  if (!enc) throw new Error("Encounter not found");
  const link = await artifacts.get<EhrLink>(enc.id, "ehr_link");
  if (!link) throw new Error("This visit was not launched from an EHR");
  if (enc.status !== "signed") throw new Error("Sign the note before filing it to the EHR");
  if (!link.encounter) {
    const f: EhrFiling = { status: "error", at: now(), message: "The EHR did not provide an encounter, which is required to file a note. Launch from an open encounter." };
    await artifacts.set(enc.id, "ehr_filing", f);
    return f;
  }
  const rec = await notes.latest(enc.id);
  if (!rec) throw new Error("No note to file");
  const consent = await consents.latest(enc.id);
  const clinician = (await users.byId(enc.userId)) ?? user;
  const text = `${noteText(rec.content)}${consent && !rec.content.sections.some((s) => s.key === "__consent") ? `\n\nDOCUMENTATION CONSENT\n${consent.statement}` : ""}\n\nSigned electronically by ${clinician.name} on ${new Date(enc.signedAt ?? Date.now()).toLocaleString("en-US")}.`;
  const doc = buildDocumentReference({
    patientId: link.patient,
    encounterId: link.encounter,
    text,
    title: `${rec.content.meta.templateId === "hp" ? "History and physical" : "Progress note"} (Chartside)`,
    date: enc.signedAt ?? now(),
    authorRef: link.fhirUser && /Practitioner\//.test(link.fhirUser) ? link.fhirUser.replace(/^.*?(Practitioner\/[^/]+)$/, "$1") : undefined,
    kind: rec.content.meta.templateId === "hp" ? "hp" : "progress",
  });
  let filing: EhrFiling;
  try {
    const { token, iss } = await accessToken(link.connectionOwner ?? user.id, link.connectionId);
    const r = await fhirRequest<FhirResource>(iss, token, "DocumentReference", { method: "POST", body: doc });
    const ref = r.data?.id ? `DocumentReference/${r.data.id}` : (r.location?.match(/DocumentReference\/[^/]+/)?.[0] ?? "DocumentReference");
    filing = { status: "filed", at: now(), reference: ref };
    await audit.log(user, enc.id, "ehr.filed", { iss, reference: ref });
  } catch (err) {
    filing = { status: "error", at: now(), message: err instanceof Error ? err.message : "Filing failed" };
    await audit.log(user, enc.id, "ehr.file_failed", { message: filing.message });
  }
  await artifacts.set(enc.id, "ehr_filing", filing);
  return filing;
}

export async function resyncPatient(user: User, patientId: string) {
  const p = await patients.get(user, patientId);
  if (!p?.externalId || !p.externalSystem) throw new Error("This patient is not linked to an EHR");
  const conn = await connections.latestFor(user.id, p.externalSystem);
  if (!conn) throw new Error("No active EHR connection. Relaunch Chartside from the EHR.");
  return importPatient(user, conn.id, p.externalId);
}
