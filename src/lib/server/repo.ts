import { all, get, jsonText, nextOrd, now, run, slugify, tx, uid } from "../db";
import type { Claim } from "../engine/billing";
import { SYSTEM_TEMPLATES } from "../engine/templates";
import type { Chart, ConsentRecord, Encounter, Note, Patient, StagedOrder, StyleRule, Template, Utterance } from "../types";

import type { Role } from "../roles";

export type { Role };
export const ROLES: Role[] = ["owner", "admin", "clinician", "nurse", "scribe", "coder", "viewer"];

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  specialty: string;
  prefs: string;
  created_at: string;
  phone?: string | null;
  phone_verified_at?: string | null;
  guest_expires_at?: string | null;
}

export interface BaseUser {
  id: string;
  email: string;
  name: string;
  specialty: string;
  prefs: UserPrefs;
  createdAt: string;
  hasPassword: boolean;
  phone?: string | null;
  guestUntil?: string | null;
}

export interface User extends BaseUser {
  orgId: string;
  orgName: string;
  role: Role;
  credential?: string;
  supervisorId?: string | null;
}

export interface UserPrefs {
  clinicNudgeHour?: number | null;
  textOptOut?: boolean;
  defaultTemplate?: string;
  state?: string;
  outputLang?: string;
  autoInsertNormals?: boolean;
  audioRetentionDays?: number;
  autoFileEhr?: boolean;
  finalPass?: boolean;
  noteDetail?: "concise" | "standard" | "detailed";
  autoDocuments?: string[];
  surveySnoozedUntil?: string;
  onboardingDismissed?: boolean;
  locationId?: string;
  npi?: { number: string; name: string; credential: string; specialty: string; state: string; matched: boolean; reason: string | null; at: string };
  invitePromptSeenAt?: string;
}

export const j = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export function toUser(r: UserRow): BaseUser {
  return { id: r.id, email: r.email, name: r.name, specialty: r.specialty, prefs: j(r.prefs, {}), createdAt: r.created_at, hasPassword: !!r.password_hash, phone: r.phone_verified_at ? r.phone ?? null : null, guestUntil: r.guest_expires_at ?? null };
}

export const SEES_ORG = new Set<Role>(["owner", "admin", "nurse", "scribe", "coder", "viewer"]);

export const users = {
  byEmail: (email: string) => get<UserRow>("SELECT * FROM users WHERE email = ?", email.toLowerCase().trim()),
  byId: async (id: string) => {
    const r = await get<UserRow>("SELECT * FROM users WHERE id = ?", id);
    return r ? toUser(r) : undefined;
  },
  create: async (u: { email: string; name: string; passwordHash: string; specialty: string }) => {
    const id = uid("usr_");
    await run("INSERT INTO users (id, email, name, password_hash, specialty, prefs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id, u.email.toLowerCase().trim(), u.name, u.passwordHash, u.specialty, JSON.stringify({ defaultTemplate: "soap", state: "IL" }), now());
    return (await users.byId(id))!;
  },
  update: async (id: string, patch: { name?: string; specialty?: string; prefs?: UserPrefs }) => {
    const cur = await users.byId(id);
    if (!cur) return undefined;
    await run("UPDATE users SET name = ?, specialty = ?, prefs = ? WHERE id = ?", patch.name ?? cur.name, patch.specialty ?? cur.specialty, JSON.stringify({ ...cur.prefs, ...(patch.prefs ?? {}) }), id);
    return users.byId(id);
  },
  setPassword: (id: string, hash: string) => run("UPDATE users SET password_hash = ? WHERE id = ?", hash, id),
};

export interface Org {
  id: string;
  name: string;
  slug: string;
  settings: OrgSettings;
  createdAt: string;
}

export interface SsoConfig {
  enabled: boolean;
  issuer: string;
  clientId: string;
  clientSecret?: string;
  domains: string[];
  defaultRole: Role;
  jit: boolean;
  requireSso: boolean;
}

export interface OrgSettings {
  sso?: SsoConfig;
  shareTemplates?: boolean;
  appsRequireCosign?: boolean;
  aiDisclosure?: boolean;
  sharing?: { external?: boolean };
  hl7?: import("./hl7").Hl7Config;
  billing?: Partial<import("../rcm/reference").BillingSettings>;
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  settings: string;
  created_at: string;
}

const toOrg = (r: OrgRow): Org => ({ id: r.id, name: r.name, slug: r.slug, settings: j(r.settings, {}), createdAt: r.created_at });

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "disabled";
  joinedAt: string;
  hasPassword: boolean;
  credential: string;
  supervisorId: string | null;
}

export const orgs = {
  create: async (name: string, ownerId: string) => {
    const id = uid("org_");
    const ts = now();
    await tx(async () => {
      await run("INSERT INTO organizations (id, name, slug, settings, created_at) VALUES (?, ?, ?, ?, ?)", id, name, `${slugify(name)}-${id.slice(-6)}`, "{}", ts);
      await run("INSERT INTO memberships (org_id, user_id, role, status, created_at) VALUES (?, ?, 'owner', 'active', ?)", id, ownerId, ts);
    });
    return (await orgs.get(id))!;
  },
  get: async (id: string) => {
    const r = await get<OrgRow>("SELECT * FROM organizations WHERE id = ?", id);
    return r ? toOrg(r) : undefined;
  },
  update: async (id: string, patch: { name?: string; settings?: OrgSettings }) => {
    const cur = await orgs.get(id);
    if (!cur) return undefined;
    await run("UPDATE organizations SET name = ?, settings = ? WHERE id = ?", patch.name ?? cur.name, JSON.stringify(patch.settings ?? cur.settings), id);
    return orgs.get(id);
  },
  forDomain: async (domain: string) => {
    const rows = await all<OrgRow>("SELECT * FROM organizations");
    return rows.map(toOrg).find((o) => o.settings.sso?.enabled && o.settings.sso.domains.map((d) => d.toLowerCase()).includes(domain.toLowerCase()));
  },
  requiringSso: async (domain: string) => {
    const o = await orgs.forDomain(domain);
    return o?.settings.sso?.requireSso ? o : undefined;
  },
  memberships: async (userId: string) =>
    all<{ org_id: string; name: string; role: Role; status: string; credential: string; supervisor_id: string | null }>("SELECT m.org_id, o.name, m.role, m.status, m.credential, m.supervisor_id FROM memberships m JOIN organizations o ON o.id = m.org_id WHERE m.user_id = ? ORDER BY m.created_at", userId),
  membership: (orgId: string, userId: string) => get<{ role: Role; status: string; credential: string; supervisor_id: string | null }>("SELECT role, status, credential, supervisor_id FROM memberships WHERE org_id = ? AND user_id = ?", orgId, userId),
  members: async (orgId: string): Promise<Member[]> =>
    (await all<{ user_id: string; name: string; email: string; role: Role; status: "active" | "disabled"; created_at: string; password_hash: string; credential: string; supervisor_id: string | null }>("SELECT m.user_id, u.name, u.email, m.role, m.status, m.created_at, u.password_hash, m.credential, m.supervisor_id FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY m.created_at", orgId)).map((r) => ({ userId: r.user_id, name: r.name, email: r.email, role: r.role, status: r.status, joinedAt: r.created_at, hasPassword: !!r.password_hash, credential: r.credential ?? "", supervisorId: r.supervisor_id ?? null })),
  setClinical: (orgId: string, userId: string, credential: string, supervisorId: string | null) => run("UPDATE memberships SET credential = ?, supervisor_id = ? WHERE org_id = ? AND user_id = ?", credential, supervisorId, orgId, userId),
  addMember: (orgId: string, userId: string, role: Role) => run("INSERT INTO memberships (org_id, user_id, role, status, created_at) VALUES (?, ?, ?, 'active', ?) ON CONFLICT (org_id, user_id) DO UPDATE SET role = excluded.role, status = 'active'", orgId, userId, role, now()),
  setRole: (orgId: string, userId: string, role: Role) => run("UPDATE memberships SET role = ? WHERE org_id = ? AND user_id = ?", role, orgId, userId),
  setStatus: (orgId: string, userId: string, status: "active" | "disabled") => run("UPDATE memberships SET status = ? WHERE org_id = ? AND user_id = ?", status, orgId, userId),
  removeMember: (orgId: string, userId: string) => run("DELETE FROM memberships WHERE org_id = ? AND user_id = ?", orgId, userId),
};

export interface Invite {
  token: string;
  orgId: string;
  email: string;
  role: Role;
  createdBy: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export const invites = {
  create: async (orgId: string, email: string, role: Role, createdBy: string, days = 7) => {
    const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
    await run("INSERT INTO invites (token, org_id, email, role, created_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", token, orgId, email.toLowerCase().trim(), role, createdBy, new Date(Date.now() + days * 86400000).toISOString(), now());
    return token;
  },
  get: async (token: string): Promise<Invite | undefined> => {
    const r = await get<{ token: string; org_id: string; email: string; role: Role; created_by: string; expires_at: string; accepted_at: string | null; created_at: string }>("SELECT * FROM invites WHERE token = ?", token);
    return r ? { token: r.token, orgId: r.org_id, email: r.email, role: r.role, createdBy: r.created_by, expiresAt: r.expires_at, acceptedAt: r.accepted_at, createdAt: r.created_at } : undefined;
  },
  pending: async (orgId: string) => (await all<{ token: string }>("SELECT token FROM invites WHERE org_id = ? AND accepted_at IS NULL AND expires_at > ? ORDER BY created_at DESC", orgId, now())).map((r) => r.token),
  accept: (token: string) => run("UPDATE invites SET accepted_at = ? WHERE token = ?", now(), token),
  revoke: (orgId: string, token: string) => run("DELETE FROM invites WHERE org_id = ? AND token = ? AND accepted_at IS NULL", orgId, token),
};

export async function actorFor(userId: string, orgId?: string | null): Promise<User | undefined> {
  const u = await users.byId(userId);
  if (!u) return undefined;
  const ms = (await orgs.memberships(userId)).filter((m) => m.status === "active");
  const m = ms.find((x) => x.org_id === orgId) ?? ms[0];
  if (!m) return undefined;
  return { ...u, orgId: m.org_id, orgName: m.name, role: m.role, credential: m.credential ?? "", supervisorId: m.supervisor_id ?? null };
}

export const sessions = {
  create: async (userId: string, orgId: string | null, days = 14, userAgent: string | null = null) => {
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    await run("INSERT INTO auth_sessions (token, user_id, org_id, expires_at, created_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)", token, userId, orgId, new Date(Date.now() + days * 86400000).toISOString(), now(), now(), userAgent?.slice(0, 300) ?? null);
    return token;
  },
  user: async (token: string) => {
    const r = await get<{ user_id: string; org_id: string | null; expires_at: string; last_seen_at: string | null }>("SELECT user_id, org_id, expires_at, last_seen_at FROM auth_sessions WHERE token = ?", token);
    if (!r || new Date(r.expires_at) < new Date()) return undefined;
    const actor = await actorFor(r.user_id, r.org_id);
    if (!actor) return undefined;
    const org = await orgs.get(actor.orgId);
    const idle = ((org?.settings as { security?: { idleMinutes?: number } } | undefined)?.security?.idleMinutes ?? 30) * 60000;
    const seen = r.last_seen_at ? new Date(r.last_seen_at).getTime() : Date.now();
    if (Date.now() - seen > idle) {
      await run("DELETE FROM auth_sessions WHERE token = ?", token);
      return undefined;
    }
    if (Date.now() - seen > 30000) await run("UPDATE auth_sessions SET last_seen_at = ? WHERE token = ?", now(), token);
    return actor;
  },
  setOrg: (token: string, orgId: string) => run("UPDATE auth_sessions SET org_id = ? WHERE token = ?", orgId, token),
  remove: (token: string) => run("DELETE FROM auth_sessions WHERE token = ?", token),
  removeForUserInOrg: (userId: string, orgId: string) => run("DELETE FROM auth_sessions WHERE user_id = ? AND org_id = ?", userId, orgId),
};

interface PatientRow {
  id: string;
  user_id: string;
  org_id: string | null;
  mrn: string;
  name: string;
  dob: string;
  sex: string;
  pronouns: string;
  language: string;
  chart: string;
  created_at: string;
  external_system: string | null;
  external_id: string | null;
  phone?: string | null;
  email?: string | null;
  contact_pref?: string | null;
}

const toPatient = (r: PatientRow): Patient => ({
  id: r.id,
  mrn: r.mrn,
  name: r.name,
  dob: r.dob,
  sex: r.sex as Patient["sex"],
  pronouns: r.pronouns,
  language: r.language,
  chart: { problems: [], medications: [], allergies: [], ...j<Partial<Chart>>(r.chart, {}) } as Chart,
  externalSystem: r.external_system,
  externalId: r.external_id,
  phone: r.phone ?? null,
  email: r.email ?? null,
  contactPref: (r.contact_pref ?? null) as Patient["contactPref"],
});

export const patients = {
  list: async (u: User) => (await all<PatientRow>("SELECT * FROM patients WHERE org_id = ? ORDER BY name", u.orgId)).map(toPatient),
  page: async (u: User, opts: { q?: string; limit?: number; offset?: number } = {}) => {
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const offset = Math.max(0, opts.offset ?? 0);
    const q = (opts.q ?? "").trim().toLowerCase();
    const where = q ? "AND (LOWER(p.name) LIKE ? OR LOWER(p.mrn) LIKE ?)" : "";
    const params = q ? [u.orgId, `%${q}%`, `%${q}%`] : [u.orgId];
    const total = Number((await get<{ n: number }>(`SELECT COUNT(*) AS n FROM patients p WHERE p.org_id = ? ${where}`, ...params))?.n ?? 0);
    const rows = await all<PatientRow & { visits: number; last_visit: string | null }>(`SELECT p.*, (SELECT COUNT(*) FROM encounters e WHERE e.patient_id = p.id) AS visits, (SELECT MAX(e.scheduled_at) FROM encounters e WHERE e.patient_id = p.id) AS last_visit FROM patients p WHERE p.org_id = ? ${where} ORDER BY p.name LIMIT ${limit} OFFSET ${offset}`, ...params);
    return { total, rows: rows.map((r) => ({ ...toPatient(r), visits: Number(r.visits), lastVisit: r.last_visit })) };
  },
  get: async (u: User, id: string) => {
    const r = await get<PatientRow>("SELECT * FROM patients WHERE org_id = ? AND id = ?", u.orgId, id);
    return r ? toPatient(r) : undefined;
  },
  byIdUnscoped: async (id: string) => {
    const r = await get<PatientRow>("SELECT * FROM patients WHERE id = ?", id);
    return r ? toPatient(r) : undefined;
  },
  create: async (u: User, p: Omit<Patient, "id">) => {
    const id = uid("pat_");
    await run("INSERT INTO patients (id, user_id, org_id, mrn, name, dob, sex, pronouns, language, chart, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, u.id, u.orgId, p.mrn, p.name, p.dob, p.sex, p.pronouns, p.language, JSON.stringify(p.chart), now());
    return (await patients.get(u, id))!;
  },
  setContact: (u: User, id: string, c: { phone: string | null; email: string | null; pref: string | null }) => run("UPDATE patients SET phone = ?, email = ?, contact_pref = ? WHERE org_id = ? AND id = ?", c.phone, c.email, c.pref, u.orgId, id),
  updateChart: (u: User, id: string, chart: Chart) => run("UPDATE patients SET chart = ? WHERE org_id = ? AND id = ?", JSON.stringify(chart), u.orgId, id),
  byExternal: async (u: User, system: string, externalId: string) => {
    const r = await get<PatientRow>("SELECT * FROM patients WHERE org_id = ? AND external_system = ? AND external_id = ?", u.orgId, system, externalId);
    return r ? toPatient(r) : undefined;
  },
  link: (u: User, id: string, system: string, externalId: string, demo: { name: string; dob: string; sex: string; mrn: string; language: string }) =>
    run("UPDATE patients SET external_system = ?, external_id = ?, name = ?, dob = ?, sex = ?, mrn = ?, language = ? WHERE org_id = ? AND id = ?", system, externalId, demo.name, demo.dob, demo.sex, demo.mrn, demo.language, u.orgId, id),
  removeOrphans: (u: User) => run("DELETE FROM patients WHERE org_id = ? AND id NOT IN (SELECT DISTINCT patient_id FROM encounters WHERE patient_id IS NOT NULL)", u.orgId),
};

interface EncounterRow {
  id: string;
  user_id: string;
  org_id: string | null;
  patient_id: string | null;
  scheduled_at: string;
  visit_type: string;
  reason: string;
  status: string;
  template_id: string | null;
  setting: string;
  input_lang: string;
  output_lang: string;
  started_at: string | null;
  ended_at: string | null;
  duration_s: number;
  signed_at: string | null;
  created_at: string;
  external_system: string | null;
  external_id: string | null;
  admission_id?: string | null;
  location_id?: string | null;
  clinician_name?: string;
}

export interface EncounterWithClinician extends Encounter {
  orgId: string | null;
  clinicianName?: string;
}

const toEncounter = (r: EncounterRow): EncounterWithClinician => ({
  id: r.id,
  userId: r.user_id,
  orgId: r.org_id,
  patientId: r.patient_id,
  scheduledAt: r.scheduled_at,
  visitType: r.visit_type as Encounter["visitType"],
  reason: r.reason,
  status: r.status as Encounter["status"],
  templateId: r.template_id,
  setting: r.setting as Encounter["setting"],
  inputLang: r.input_lang,
  outputLang: r.output_lang,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  durationS: r.duration_s,
  signedAt: r.signed_at,
  createdAt: r.created_at,
  externalSystem: r.external_system,
  externalId: r.external_id,
  admissionId: r.admission_id ?? null,
  locationId: r.location_id ?? null,
  clinicianName: r.clinician_name,
});

function encounterScope(u: User) {
  return SEES_ORG.has(u.role) ? { sql: "e.org_id = ?", params: [u.orgId] } : { sql: "e.org_id = ? AND (e.user_id = ? OR e.user_id IN (SELECT sm.user_id FROM memberships sm WHERE sm.org_id = ? AND sm.supervisor_id = ?) OR e.id IN (SELECT es.encounter_id FROM encounter_shares es WHERE es.kind = 'member' AND es.access = 'edit' AND es.user_id = ? AND es.revoked_at IS NULL))", params: [u.orgId, u.id, u.orgId, u.id, u.id] };
}

export const encounters = {
  list: async (u: User, opts: { from?: string; to?: string; patientId?: string; clinicianId?: string; statuses?: string[]; admissionId?: string; outpatient?: boolean; locationId?: string } = {}) => {
    const scope = encounterScope(u);
    const where = [scope.sql];
    const params: string[] = [...scope.params];
    if (opts.from) { where.push("e.scheduled_at >= ?"); params.push(opts.from); }
    if (opts.to) { where.push("e.scheduled_at < ?"); params.push(opts.to); }
    if (opts.patientId) { where.push("e.patient_id = ?"); params.push(opts.patientId); }
    if (opts.clinicianId) { where.push("e.user_id = ?"); params.push(opts.clinicianId); }
    if (opts.statuses?.length) { where.push(`e.status IN (${opts.statuses.map(() => "?").join(", ")})`); params.push(...opts.statuses); }
    if (opts.admissionId) { where.push("e.admission_id = ?"); params.push(opts.admissionId); }
    if (opts.locationId) { where.push("e.location_id = ?"); params.push(opts.locationId); }
    if (opts.outpatient) where.push("e.admission_id IS NULL AND e.setting <> 'ed'");
    return (await all<EncounterRow>(`SELECT e.*, u.name AS clinician_name FROM encounters e JOIN users u ON u.id = e.user_id WHERE ${where.join(" AND ")} ORDER BY e.scheduled_at`, ...params)).map(toEncounter);
  },
  get: async (u: User, id: string) => {
    const scope = encounterScope(u);
    const r = await get<EncounterRow>(`SELECT e.*, u.name AS clinician_name FROM encounters e JOIN users u ON u.id = e.user_id WHERE ${scope.sql} AND e.id = ?`, ...scope.params, id);
    return r ? toEncounter(r) : undefined;
  },
  byIdUnscoped: async (id: string) => {
    const r = await get<EncounterRow>("SELECT * FROM encounters WHERE id = ?", id);
    return r ? toEncounter(r) : undefined;
  },
  create: async (u: User, e: Partial<Encounter> & { scheduledAt: string; clinicianId?: string }) => {
    const id = uid("enc_");
    await run(
      "INSERT INTO encounters (id, user_id, org_id, patient_id, scheduled_at, visit_type, reason, status, template_id, setting, input_lang, output_lang, admission_id, location_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, e.clinicianId ?? u.id, u.orgId, e.patientId ?? null, e.scheduledAt, e.visitType ?? "follow-up", e.reason ?? "", e.status ?? "scheduled", e.templateId ?? null, e.setting ?? "in-person", e.inputLang ?? "en", e.outputLang ?? "en", e.admissionId ?? null, e.locationId ?? null, now(),
    );
    return (await encounters.get(u, id))!;
  },
  byExternal: async (u: User, system: string, externalId: string) => {
    const r = await get<EncounterRow>("SELECT * FROM encounters WHERE org_id = ? AND external_system = ? AND external_id = ?", u.orgId, system, externalId);
    return r ? toEncounter(r) : undefined;
  },
  link: (u: User, id: string, system: string, externalId: string) => run("UPDATE encounters SET external_system = ?, external_id = ? WHERE org_id = ? AND id = ?", system, externalId, u.orgId, id),
  update: async (u: User, id: string, patch: Partial<Encounter>) => {
    const cur = await encounters.get(u, id);
    if (!cur) return undefined;
    const n = { ...cur, ...patch };
    await run(
      "UPDATE encounters SET patient_id = ?, visit_type = ?, reason = ?, status = ?, template_id = ?, setting = ?, input_lang = ?, output_lang = ?, started_at = ?, ended_at = ?, duration_s = ?, signed_at = ? WHERE id = ? AND org_id = ?",
      n.patientId, n.visitType, n.reason, n.status, n.templateId, n.setting, n.inputLang, n.outputLang, n.startedAt, n.endedAt, n.durationS, n.signedAt, id, u.orgId,
    );
    return encounters.get(u, id);
  },
  removeToday: (u: User, from: string, to: string) => run("DELETE FROM encounters WHERE org_id = ? AND user_id = ? AND scheduled_at >= ? AND scheduled_at < ? AND admission_id IS NULL", u.orgId, u.id, from, to),
  setSignedAt: (id: string, iso: string) => run("UPDATE encounters SET signed_at = ? WHERE id = ?", iso, id),
};

interface UttRow {
  id: string;
  encounter_id: string;
  seq: number;
  speaker: string;
  speaker_source: string;
  text: string;
  t_start: number;
  t_end: number;
  lang: string;
  redacted: number;
  voice: string | null;
  confidence: number | null;
  source: string;
}

const toUtt = (r: UttRow): Utterance => ({
  id: r.id,
  seq: r.seq,
  speaker: r.speaker as Utterance["speaker"],
  speakerSource: r.speaker_source as Utterance["speakerSource"],
  text: r.text,
  tStart: r.t_start,
  tEnd: r.t_end,
  lang: r.lang,
  redacted: !!r.redacted,
  voice: r.voice ? j(r.voice, null) : null,
  confidence: r.confidence,
  source: (r.source ?? "live") as Utterance["source"],
});

async function insertUtt(encId: string, seq: number, it: Omit<Utterance, "id" | "seq">) {
  const id = uid("u_");
  await run(
    "INSERT INTO utterances (id, encounter_id, seq, speaker, speaker_source, text, t_start, t_end, lang, redacted, voice, confidence, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, encId, seq, it.speaker, it.speakerSource ?? "auto", it.text, it.tStart, it.tEnd, it.lang ?? "en", it.redacted ? 1 : 0, it.voice ? JSON.stringify(it.voice) : null, it.confidence ?? null, it.source ?? "live",
  );
  return { ...it, id, seq } as Utterance;
}

export const utterances = {
  list: async (encId: string) => (await all<UttRow>("SELECT * FROM utterances WHERE encounter_id = ? ORDER BY seq", encId)).map(toUtt),
  append: (encId: string, items: Omit<Utterance, "id" | "seq">[]) =>
    tx(async () => {
      const last = (await get<{ m: number | null }>("SELECT MAX(seq) AS m FROM utterances WHERE encounter_id = ?", encId))?.m ?? -1;
      const out: Utterance[] = [];
      for (let i = 0; i < items.length; i++) out.push(await insertUtt(encId, Number(last) + 1 + i, items[i]));
      return out;
    }),
  replaceAll: (encId: string, items: Omit<Utterance, "id" | "seq">[]) =>
    tx(async () => {
      await run("DELETE FROM utterances WHERE encounter_id = ?", encId);
      const out: Utterance[] = [];
      for (let i = 0; i < items.length; i++) out.push(await insertUtt(encId, i, items[i]));
      return out;
    }),
  setSpeakers: (encId: string, map: Record<string, Utterance["speaker"]>) =>
    tx(async () => {
      for (const [id, speaker] of Object.entries(map)) await run("UPDATE utterances SET speaker = ? WHERE encounter_id = ? AND id = ? AND speaker_source = 'auto'", speaker, encId, id);
    }),
  update: async (encId: string, id: string, patch: { speaker?: string; text?: string; redacted?: boolean }) => {
    const cur = await get<UttRow>("SELECT * FROM utterances WHERE encounter_id = ? AND id = ?", encId, id);
    if (!cur) return undefined;
    await run(
      "UPDATE utterances SET speaker = ?, speaker_source = ?, text = ?, redacted = ? WHERE id = ?",
      patch.speaker ?? cur.speaker, patch.speaker ? "manual" : cur.speaker_source, patch.text ?? cur.text, patch.redacted === undefined ? cur.redacted : patch.redacted ? 1 : 0, id,
    );
    return toUtt((await get<UttRow>("SELECT * FROM utterances WHERE id = ?", id))!);
  },
  clear: (encId: string) => run("DELETE FROM utterances WHERE encounter_id = ?", encId),
};

interface ConsentRow {
  id: string;
  encounter_id: string;
  decision: string;
  method: string;
  state: string;
  all_party: number;
  others_present: number;
  script_version: string;
  statement: string;
  digest: string;
  created_at: string;
}

export const consents = {
  add: async (c: Omit<ConsentRecord, "id" | "createdAt"> & { userId: string }) => {
    await run(
      "INSERT INTO consents (id, encounter_id, user_id, decision, method, state, all_party, others_present, script_version, statement, digest, ord, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      uid("con_"), c.encounterId, c.userId, c.decision, c.method, c.state, c.allParty ? 1 : 0, c.othersPresent ? 1 : 0, c.scriptVersion, c.statement, c.digest, nextOrd(), now(),
    );
    return (await consents.latest(c.encounterId))!;
  },
  latest: async (encId: string): Promise<ConsentRecord | undefined> => {
    const r = await get<ConsentRow>("SELECT * FROM consents WHERE encounter_id = ? ORDER BY ord DESC LIMIT 1", encId);
    return r
      ? { id: r.id, encounterId: r.encounter_id, decision: r.decision as ConsentRecord["decision"], method: r.method as ConsentRecord["method"], state: r.state, allParty: !!r.all_party, othersPresent: !!r.others_present, scriptVersion: r.script_version, statement: r.statement, digest: r.digest, createdAt: r.created_at }
      : undefined;
  },
};

interface NoteRow {
  id: string;
  encounter_id: string;
  version: number;
  template_id: string | null;
  engine: string;
  content: string;
  generated: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface NoteRecord {
  id: string;
  version: number;
  engine: string;
  content: Note;
  generated: Note;
  status: "draft" | "signed";
  createdAt: string;
  updatedAt: string;
}

const emptyNote = { sections: [], meta: { engine: "local", templateId: "", generatedAt: "" } } as Note;
const toNote = (r: NoteRow): NoteRecord => ({ id: r.id, version: r.version, engine: r.engine, content: j(r.content, emptyNote), generated: j(r.generated, emptyNote), status: r.status as NoteRecord["status"], createdAt: r.created_at, updatedAt: r.updated_at });

export const notes = {
  latest: async (encId: string) => {
    const r = await get<NoteRow>("SELECT * FROM notes WHERE encounter_id = ? ORDER BY version DESC LIMIT 1", encId);
    return r ? toNote(r) : undefined;
  },
  versions: async (encId: string) => (await all<NoteRow>("SELECT * FROM notes WHERE encounter_id = ? ORDER BY version DESC", encId)).map(toNote),
  create: async (encId: string, note: Note, authorId: string | null = null) => {
    const v = Number((await get<{ m: number | null }>("SELECT MAX(version) AS m FROM notes WHERE encounter_id = ?", encId))?.m ?? 0) + 1;
    const t = now();
    await run("INSERT INTO notes (id, encounter_id, version, template_id, engine, content, generated, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)", uid("note_"), encId, v, note.meta.templateId, note.meta.engine, JSON.stringify(note), JSON.stringify(note), t, t);
    await revisions.add(encId, v, authorId, note.meta.engine === "claude" ? "ai:claude" : "ai:local", "drafted", note);
    return (await notes.latest(encId))!;
  },
  saveContent: async (encId: string, note: Note, meta?: { authorId: string | null; source: string; reason?: string }) => {
    const cur = await notes.latest(encId);
    if (!cur) return undefined;
    await run("UPDATE notes SET content = ?, updated_at = ? WHERE id = ?", JSON.stringify(note), now(), cur.id);
    if (meta && JSON.stringify(cur.content.sections) !== JSON.stringify(note.sections)) await revisions.add(encId, cur.version, meta.authorId, meta.source, meta.reason ?? "", note);
    return notes.latest(encId);
  },
  setStatus: async (encId: string, status: "draft" | "signed") => {
    const cur = await notes.latest(encId);
    if (cur) await run("UPDATE notes SET status = ?, updated_at = ? WHERE id = ?", status, now(), cur.id);
  },
};

export const artifacts = {
  set: (encId: string, kind: string, content: unknown) =>
    run("INSERT INTO artifacts (id, encounter_id, kind, content, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(encounter_id, kind) DO UPDATE SET content = excluded.content, created_at = excluded.created_at", uid("art_"), encId, kind, JSON.stringify(content), now()),
  get: async <T>(encId: string, kind: string) => {
    const r = await get<{ content: string }>("SELECT content FROM artifacts WHERE encounter_id = ? AND kind = ?", encId, kind);
    return r ? j<T | undefined>(r.content, undefined) : undefined;
  },
  all: async (encId: string) => Object.fromEntries((await all<{ kind: string; content: string }>("SELECT kind, content FROM artifacts WHERE encounter_id = ?", encId)).map((r) => [r.kind, j(r.content, null)])),
};

interface OrderRow {
  id: string;
  kind: string;
  name: string;
  detail: string;
  status: string;
  evidence: string;
  alerts: string;
  problem: string;
}

const toOrder = (r: OrderRow): StagedOrder => ({ id: r.id, kind: r.kind as StagedOrder["kind"], name: r.name, detail: r.detail, status: r.status as StagedOrder["status"], evidence: j(r.evidence, []), alerts: j(r.alerts, []), problem: r.problem });

export const orders = {
  list: async (encId: string) => (await all<OrderRow>("SELECT * FROM orders WHERE encounter_id = ? ORDER BY ord", encId)).map(toOrder),
  replace: (encId: string, items: Omit<StagedOrder, "id">[]) =>
    tx(async () => {
      const prior = new Map((await orders.list(encId)).map((o) => [o.name, o.status]));
      await run("DELETE FROM orders WHERE encounter_id = ?", encId);
      for (const o of items) {
        const status = o.status === "rejected" ? "rejected" : prior.get(o.name) ?? o.status;
        await run("INSERT INTO orders (id, encounter_id, kind, name, detail, status, evidence, alerts, problem, ord, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", uid("ord_"), encId, o.kind, o.name, o.detail, status, JSON.stringify(o.evidence), JSON.stringify(o.alerts), o.problem, nextOrd(), now());
      }
      return orders.list(encId);
    }),
  setStatus: async (encId: string, id: string, status: StagedOrder["status"]) => {
    await run("UPDATE orders SET status = ? WHERE encounter_id = ? AND id = ?", status, encId, id);
    return (await orders.list(encId)).find((o) => o.id === id);
  },
};

interface TemplateRow {
  id: string;
  user_id: string | null;
  org_id: string | null;
  shared: number;
  name: string;
  specialty: string;
  description: string;
  sections: string;
  style: string;
}

export interface TemplateWithSharing extends Template {
  shared?: boolean;
  ownedByMe?: boolean;
}

const toTemplate = (r: TemplateRow, me?: string): TemplateWithSharing => ({ id: r.id, userId: r.user_id, name: r.name, specialty: r.specialty, description: r.description, sections: j(r.sections, []), style: j(r.style, {}), shared: !!r.shared, ownedByMe: r.user_id === me });

export const templates = {
  list: async (u: User): Promise<TemplateWithSharing[]> => [...SYSTEM_TEMPLATES, ...(await all<TemplateRow>("SELECT * FROM templates WHERE org_id = ? AND (user_id = ? OR shared = 1) ORDER BY created_at", u.orgId, u.id)).map((r) => toTemplate(r, u.id))],
  get: async (u: User, id: string): Promise<TemplateWithSharing | undefined> => {
    const sys = SYSTEM_TEMPLATES.find((t) => t.id === id);
    if (sys) return sys;
    const r = await get<TemplateRow>("SELECT * FROM templates WHERE id = ? AND org_id = ? AND (user_id = ? OR shared = 1)", id, u.orgId, u.id);
    return r ? toTemplate(r, u.id) : undefined;
  },
  save: async (u: User, t: Omit<Template, "id" | "userId"> & { id?: string; shared?: boolean }) => {
    if (t.id && SYSTEM_TEMPLATES.some((s) => s.id === t.id)) throw new Error("System templates are read-only; duplicate it first.");
    const id = t.id ?? uid("tpl_");
    const existing = t.id ? await get<TemplateRow>("SELECT * FROM templates WHERE id = ? AND org_id = ?", t.id, u.orgId) : undefined;
    if (existing && existing.user_id !== u.id && !["owner", "admin"].includes(u.role)) throw new Error("Only the template's author or an admin can edit a shared template.");
    const shared = t.shared === undefined ? existing?.shared ?? 0 : t.shared ? 1 : 0;
    if (existing) await run("UPDATE templates SET name = ?, specialty = ?, description = ?, sections = ?, style = ?, shared = ? WHERE id = ? AND org_id = ?", t.name, t.specialty, t.description, JSON.stringify(t.sections), JSON.stringify(t.style), shared, id, u.orgId);
    else await run("INSERT INTO templates (id, user_id, org_id, shared, name, specialty, description, sections, style, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, u.id, u.orgId, shared, t.name, t.specialty, t.description, JSON.stringify(t.sections), JSON.stringify(t.style), now());
    return (await templates.get(u, id))!;
  },
  remove: (u: User, id: string) => run(`DELETE FROM templates WHERE id = ? AND org_id = ? AND ${["owner", "admin"].includes(u.role) ? "1 = 1" : "user_id = ?"}`, ...(["owner", "admin"].includes(u.role) ? [id, u.orgId] : [id, u.orgId, u.id])),
};

interface RuleRow {
  id: string;
  kind: string;
  section: string;
  value: string;
  label: string;
  source: string;
  support: number;
  active: number;
}

const toRule = (r: RuleRow): StyleRule => ({ id: r.id, kind: r.kind as StyleRule["kind"], section: r.section, value: r.value, label: r.label, source: r.source as StyleRule["source"], support: r.support, active: !!r.active });

export const styleRules = {
  list: async (userId: string) => (await all<RuleRow>("SELECT * FROM style_rules WHERE user_id = ? ORDER BY active DESC, support DESC, created_at", userId)).map(toRule),
  learn: async (userId: string, c: Pick<StyleRule, "kind" | "section" | "value" | "label">, threshold = 2) => {
    const existing = await get<RuleRow>("SELECT * FROM style_rules WHERE user_id = ? AND kind = ? AND section = ? AND value = ?", userId, c.kind, c.section, c.value);
    if (existing) {
      const support = existing.support + 1;
      await run("UPDATE style_rules SET support = ?, active = ? WHERE id = ?", support, existing.source === "learned" && support >= threshold ? 1 : existing.active, existing.id);
      return;
    }
    await run("INSERT INTO style_rules (id, user_id, kind, section, value, label, source, support, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 'learned', 1, ?, ?)", uid("sty_"), userId, c.kind, c.section, c.value, c.label, threshold <= 1 ? 1 : 0, now());
  },
  addManual: (userId: string, c: Pick<StyleRule, "kind" | "section" | "value" | "label">) =>
    run("INSERT INTO style_rules (id, user_id, kind, section, value, label, source, support, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 'manual', 1, 1, ?) ON CONFLICT(user_id, kind, section, value) DO UPDATE SET active = 1, source = 'manual'", uid("sty_"), userId, c.kind, c.section, c.value, c.label, now()),
  setActive: (userId: string, id: string, active: boolean) => run("UPDATE style_rules SET active = ? WHERE id = ? AND user_id = ?", active ? 1 : 0, id, userId),
  remove: (userId: string, id: string) => run("DELETE FROM style_rules WHERE id = ? AND user_id = ?", id, userId),
};

export const feedback = {
  add: (encId: string, section: string, rating: number, comment = "") => run("INSERT INTO feedback (id, encounter_id, section, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)", uid("fb_"), encId, section, rating, comment, now()),
  forEncounter: (encId: string) => all<{ section: string; rating: number }>("SELECT section, rating FROM feedback WHERE encounter_id = ? ORDER BY created_at", encId),
};

export const patientFlags = {
  add: (encId: string, item: string, comment: string) => run("INSERT INTO patient_flags (id, encounter_id, item, comment, created_at) VALUES (?, ?, ?, ?, ?)", uid("pf_"), encId, item, comment, now()),
  list: (encId: string) => all<{ id: string; item: string; comment: string; resolved: number; created_at: string }>("SELECT * FROM patient_flags WHERE encounter_id = ? ORDER BY created_at", encId),
  resolve: (encId: string, id: string) => run("UPDATE patient_flags SET resolved = 1 WHERE encounter_id = ? AND id = ?", encId, id),
};

type AuditActor = User | { id: string | null; orgId: string | null } | null;

export const audit = {
  log: async (actor: AuditActor, encId: string | null, action: string, detail: Record<string, unknown> = {}) => {
    let orgId = actor?.orgId ?? null;
    if (!orgId && encId) orgId = (await get<{ org_id: string | null }>("SELECT org_id FROM encounters WHERE id = ?", encId))?.org_id ?? null;
    await run("INSERT INTO audit (id, user_id, org_id, encounter_id, action, detail, ord, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", uid("aud_"), actor?.id ?? null, orgId, encId, action, JSON.stringify(detail), nextOrd(), now());
  },
  forEncounter: async (encId: string) =>
    (await all<{ id: string; action: string; detail: string; created_at: string; user_name: string | null }>("SELECT a.id, a.action, a.detail, a.created_at, u.name AS user_name FROM audit a LEFT JOIN users u ON u.id = a.user_id WHERE a.encounter_id = ? ORDER BY a.ord", encId)).map((r) => ({ ...r, detail: j<Record<string, unknown>>(r.detail, {}) })),
  forOrg: async (orgId: string, limit = 200) =>
    (await all<{ id: string; action: string; detail: string; created_at: string; user_name: string | null; encounter_id: string | null }>("SELECT a.id, a.action, a.detail, a.created_at, a.encounter_id, u.name AS user_name FROM audit a LEFT JOIN users u ON u.id = a.user_id WHERE a.org_id = ? ORDER BY a.created_at DESC, a.ord DESC LIMIT ?", orgId, limit)).map((r) => ({ ...r, detail: j<Record<string, unknown>>(r.detail, {}) })),
  retime: (encId: string, action: string, iso: string, not = false) => run(`UPDATE audit SET created_at = ? WHERE encounter_id = ? AND action ${not ? "!=" : "="} ?`, iso, encId, action),
};

export async function encounterByShareToken(token: string) {
  const r = await get<{ encounter_id: string }>(`SELECT encounter_id FROM artifacts WHERE kind = 'share' AND ${jsonText("content", "token")} = ?`, token);
  if (!r) return undefined;
  return encounters.byIdUnscoped(r.encounter_id);
}

export interface AudioChunk {
  id: string;
  seq: number;
  tMs: number;
  bytes: number;
  mime: string;
  path: string;
}

export const audioChunks = {
  add: (encId: string, c: Omit<AudioChunk, "id">) =>
    run("INSERT INTO audio_chunks (id, encounter_id, seq, t_ms, bytes, mime, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(encounter_id, seq) DO UPDATE SET bytes = excluded.bytes, path = excluded.path, t_ms = excluded.t_ms", uid("aud_"), encId, c.seq, c.tMs, c.bytes, c.mime, c.path, now()),
  list: async (encId: string) => (await all<{ id: string; seq: number; t_ms: number; bytes: number; mime: string; path: string }>("SELECT id, seq, t_ms, bytes, mime, path FROM audio_chunks WHERE encounter_id = ? ORDER BY seq", encId)).map((r) => ({ id: r.id, seq: r.seq, tMs: r.t_ms, bytes: r.bytes, mime: r.mime, path: r.path })),
  remove: (encId: string) => run("DELETE FROM audio_chunks WHERE encounter_id = ?", encId),
  expired: async (orgId: string, before: string) => (await all<{ encounter_id: string }>("SELECT DISTINCT a.encounter_id FROM audio_chunks a JOIN encounters e ON e.id = a.encounter_id WHERE e.org_id = ? AND e.signed_at IS NOT NULL AND e.signed_at <= ?", orgId, before)).map((r) => r.encounter_id),
};

export type ClaimStatus = "draft" | "needs_review" | "ready" | "approved" | "on_hold" | "submitted" | "rejected" | "accepted" | "paid" | "partial" | "denied" | "appealed" | "closed";

export interface ClaimLifecycle {
  clearinghouse?: string;
  controlNumber?: string;
  submittedAt?: string;
  acceptedAt?: string;
  rejections?: string[];
  remits: import("../rcm/remit").Remit[];
  appeal?: { at: string; by: string; letter: string; status: "sent" | "won" | "lost"; resolvedAt?: string };
  frequency?: 1 | 7;
  closedAt?: string;
  writeOff?: number;
}

export interface ClaimRecord {
  encounterId: string;
  status: ClaimStatus;
  content: Claim;
  history: { at: string; action: string; note?: string; by?: string }[];
  lifecycle: ClaimLifecycle;
  reviewerNote: string;
  updatedAt: string;
}

export const claims = {
  get: async (encId: string): Promise<ClaimRecord | undefined> => {
    const r = await get<{ encounter_id: string; status: string; content: string; reviewer_note: string; updated_at: string }>("SELECT * FROM claims WHERE encounter_id = ?", encId);
    if (!r) return undefined;
    const c = j<{ claim: Claim; history: ClaimRecord["history"]; lifecycle?: ClaimLifecycle }>(r.content, { claim: null as never, history: [] });
    return { encounterId: r.encounter_id, status: r.status as ClaimStatus, content: c.claim, history: c.history ?? [], lifecycle: c.lifecycle ?? { remits: [] }, reviewerNote: r.reviewer_note, updatedAt: r.updated_at };
  },
  save: async (userId: string, encId: string, status: ClaimStatus, claim: Claim, history: ClaimRecord["history"], note?: string, lifecycle?: ClaimLifecycle) => {
    const keep = lifecycle ?? (await claims.get(encId))?.lifecycle ?? { remits: [] };
    await run(
      "INSERT INTO claims (encounter_id, user_id, status, content, reviewer_note, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(encounter_id) DO UPDATE SET status = excluded.status, content = excluded.content, reviewer_note = CASE WHEN excluded.reviewer_note <> '' THEN excluded.reviewer_note ELSE claims.reviewer_note END, updated_at = excluded.updated_at",
      encId, userId, status, JSON.stringify({ claim, history, lifecycle: keep }), note ?? "", now(),
    );
    return (await claims.get(encId))!;
  },
  list: async (u: User) => {
    const rows = await all<{ encounter_id: string }>(
      `SELECT c.encounter_id FROM claims c JOIN encounters e ON e.id = c.encounter_id WHERE e.org_id = ? ${["owner", "admin", "coder", "viewer"].includes(u.role) ? "" : "AND e.user_id = ?"} ORDER BY c.updated_at DESC`,
      ...(["owner", "admin", "coder", "viewer"].includes(u.role) ? [u.orgId] : [u.orgId, u.id]),
    );
    const out: ClaimRecord[] = [];
    for (const r of rows) out.push((await claims.get(r.encounter_id))!);
    return out;
  },
};

export interface Addendum {
  id: string;
  encounterId: string;
  userId: string;
  author: string;
  kind: import("../engine/attest").AddendumKind;
  text: string;
  reason: string;
  prevDigest: string;
  digest: string;
  filing: { status: "filed" | "error"; at: string; reference?: string; message?: string } | null;
  createdAt: string;
}

interface AddendumRow {
  id: string;
  encounter_id: string;
  user_id: string;
  author: string | null;
  kind: string;
  text: string;
  reason: string;
  prev_digest: string;
  digest: string;
  filing: string | null;
  created_at: string;
}

const toAddendum = (r: AddendumRow): Addendum => ({ id: r.id, encounterId: r.encounter_id, userId: r.user_id, author: r.author ?? "Former member", kind: r.kind as Addendum["kind"], text: r.text, reason: r.reason, prevDigest: r.prev_digest, digest: r.digest, filing: r.filing ? j(r.filing, null) : null, createdAt: r.created_at });

export const addenda = {
  list: async (encId: string) => (await all<AddendumRow>("SELECT a.*, u.name AS author FROM addenda a LEFT JOIN users u ON u.id = a.user_id WHERE a.encounter_id = ? ORDER BY a.ord", encId)).map(toAddendum),
  add: async (a: Omit<Addendum, "id" | "author" | "filing">) => {
    const id = uid("add_");
    await run("INSERT INTO addenda (id, encounter_id, user_id, kind, text, reason, prev_digest, digest, ord, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, a.encounterId, a.userId, a.kind, a.text, a.reason, a.prevDigest, a.digest, nextOrd(), a.createdAt);
    return (await addenda.list(a.encounterId)).find((x) => x.id === id)!;
  },
  setFiling: (id: string, filing: Addendum["filing"]) => run("UPDATE addenda SET filing = ? WHERE id = ?", JSON.stringify(filing), id),
};

export interface Revision {
  id: string;
  noteVersion: number;
  author: string | null;
  source: string;
  reason: string;
  content: Note;
  createdAt: string;
}

export const revisions = {
  add: (encId: string, version: number, authorId: string | null, source: string, reason: string, content: Note) =>
    run("INSERT INTO note_revisions (id, encounter_id, note_version, author_id, source, reason, content, ord, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", uid("rev_"), encId, version, authorId, source, reason, JSON.stringify(content), nextOrd(), now()),
  list: async (encId: string): Promise<Revision[]> =>
    (await all<{ id: string; note_version: number; author: string | null; source: string; reason: string; content: string; created_at: string }>("SELECT r.id, r.note_version, us.name AS author, r.source, r.reason, r.content, r.created_at FROM note_revisions r LEFT JOIN users us ON us.id = r.author_id WHERE r.encounter_id = ? ORDER BY r.ord", encId)).map((r) => ({ id: r.id, noteVersion: r.note_version, author: r.author, source: r.source, reason: r.reason, content: j(r.content, emptyNote), createdAt: r.created_at })),
};
