import { all, get, now, run, tx, uid } from "../db";
import { SYSTEM_TEMPLATES } from "../engine/templates";
import type {
  Chart,
  ConsentRecord,
  Encounter,
  Note,
  Patient,
  StagedOrder,
  StyleRule,
  Template,
  Utterance,
} from "../types";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  specialty: string;
  prefs: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  specialty: string;
  prefs: UserPrefs;
  createdAt: string;
}

export interface UserPrefs {
  defaultTemplate?: string;
  state?: string;
  outputLang?: string;
  autoInsertNormals?: boolean;
  audioRetentionDays?: number;
  finalPass?: boolean;
}

const j = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export function toUser(r: UserRow): User {
  return { id: r.id, email: r.email, name: r.name, specialty: r.specialty, prefs: j(r.prefs, {}), createdAt: r.created_at };
}

export const users = {
  byEmail: (email: string) => get<UserRow>("SELECT * FROM users WHERE email = ?", email.toLowerCase()),
  byId: (id: string) => {
    const r = get<UserRow>("SELECT * FROM users WHERE id = ?", id);
    return r ? toUser(r) : undefined;
  },
  create: (u: { email: string; name: string; passwordHash: string; specialty: string }) => {
    const id = uid("usr_");
    run("INSERT INTO users (id, email, name, password_hash, specialty, prefs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id, u.email.toLowerCase(), u.name, u.passwordHash, u.specialty, JSON.stringify({ defaultTemplate: "soap", state: "IL" }), now());
    return users.byId(id)!;
  },
  update: (id: string, patch: { name?: string; specialty?: string; prefs?: UserPrefs }) => {
    const cur = users.byId(id);
    if (!cur) return undefined;
    run("UPDATE users SET name = ?, specialty = ?, prefs = ? WHERE id = ?", patch.name ?? cur.name, patch.specialty ?? cur.specialty, JSON.stringify({ ...cur.prefs, ...(patch.prefs ?? {}) }), id);
    return users.byId(id);
  },
};

export const sessions = {
  create: (userId: string, days = 14) => {
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    run("INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, ?)", token, userId, new Date(Date.now() + days * 86400000).toISOString());
    return token;
  },
  user: (token: string) => {
    const r = get<{ user_id: string; expires_at: string }>("SELECT user_id, expires_at FROM auth_sessions WHERE token = ?", token);
    if (!r || new Date(r.expires_at) < new Date()) return undefined;
    return users.byId(r.user_id);
  },
  remove: (token: string) => run("DELETE FROM auth_sessions WHERE token = ?", token),
};

interface PatientRow {
  id: string;
  user_id: string;
  mrn: string;
  name: string;
  dob: string;
  sex: string;
  pronouns: string;
  language: string;
  chart: string;
  created_at: string;
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
});

export const patients = {
  list: (userId: string) => all<PatientRow>("SELECT * FROM patients WHERE user_id = ? ORDER BY name", userId).map(toPatient),
  get: (userId: string, id: string) => {
    const r = get<PatientRow>("SELECT * FROM patients WHERE user_id = ? AND id = ?", userId, id);
    return r ? toPatient(r) : undefined;
  },
  create: (userId: string, p: Omit<Patient, "id">) => {
    const id = uid("pat_");
    run("INSERT INTO patients (id, user_id, mrn, name, dob, sex, pronouns, language, chart, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, userId, p.mrn, p.name, p.dob, p.sex, p.pronouns, p.language, JSON.stringify(p.chart), now());
    return patients.get(userId, id)!;
  },
  updateChart: (userId: string, id: string, chart: Chart) => run("UPDATE patients SET chart = ? WHERE user_id = ? AND id = ?", JSON.stringify(chart), userId, id),
};

interface EncounterRow {
  id: string;
  user_id: string;
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
}

const toEncounter = (r: EncounterRow): Encounter => ({
  id: r.id,
  userId: r.user_id,
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
});

export const encounters = {
  list: (userId: string, opts: { from?: string; to?: string; patientId?: string } = {}) => {
    const where = ["user_id = ?"];
    const params: string[] = [userId];
    if (opts.from) { where.push("scheduled_at >= ?"); params.push(opts.from); }
    if (opts.to) { where.push("scheduled_at < ?"); params.push(opts.to); }
    if (opts.patientId) { where.push("patient_id = ?"); params.push(opts.patientId); }
    return all<EncounterRow>(`SELECT * FROM encounters WHERE ${where.join(" AND ")} ORDER BY scheduled_at`, ...params).map(toEncounter);
  },
  get: (userId: string, id: string) => {
    const r = get<EncounterRow>("SELECT * FROM encounters WHERE user_id = ? AND id = ?", userId, id);
    return r ? toEncounter(r) : undefined;
  },
  create: (userId: string, e: Partial<Encounter> & { scheduledAt: string }) => {
    const id = uid("enc_");
    run(
      "INSERT INTO encounters (id, user_id, patient_id, scheduled_at, visit_type, reason, status, template_id, setting, input_lang, output_lang, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, userId, e.patientId ?? null, e.scheduledAt, e.visitType ?? "follow-up", e.reason ?? "", e.status ?? "scheduled", e.templateId ?? null, e.setting ?? "in-person", e.inputLang ?? "en", e.outputLang ?? "en", now(),
    );
    return encounters.get(userId, id)!;
  },
  update: (userId: string, id: string, patch: Partial<Encounter>) => {
    const cur = encounters.get(userId, id);
    if (!cur) return undefined;
    const n = { ...cur, ...patch };
    run(
      "UPDATE encounters SET patient_id = ?, visit_type = ?, reason = ?, status = ?, template_id = ?, setting = ?, input_lang = ?, output_lang = ?, started_at = ?, ended_at = ?, duration_s = ?, signed_at = ? WHERE id = ? AND user_id = ?",
      n.patientId, n.visitType, n.reason, n.status, n.templateId, n.setting, n.inputLang, n.outputLang, n.startedAt, n.endedAt, n.durationS, n.signedAt, id, userId,
    );
    return encounters.get(userId, id);
  },
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

function insertUtt(encId: string, seq: number, it: Omit<Utterance, "id" | "seq">) {
  const id = uid("u_");
  run(
    "INSERT INTO utterances (id, encounter_id, seq, speaker, speaker_source, text, t_start, t_end, lang, redacted, voice, confidence, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, encId, seq, it.speaker, it.speakerSource ?? "auto", it.text, it.tStart, it.tEnd, it.lang ?? "en", it.redacted ? 1 : 0, it.voice ? JSON.stringify(it.voice) : null, it.confidence ?? null, it.source ?? "live",
  );
  return { ...it, id, seq } as Utterance;
}

export const utterances = {
  list: (encId: string) => all<UttRow>("SELECT * FROM utterances WHERE encounter_id = ? ORDER BY seq", encId).map(toUtt),
  append: (encId: string, items: Omit<Utterance, "id" | "seq">[]) =>
    tx(() => {
      const last = get<{ m: number | null }>("SELECT MAX(seq) AS m FROM utterances WHERE encounter_id = ?", encId)?.m ?? -1;
      return items.map((it, i) => insertUtt(encId, last + 1 + i, it));
    }),
  replaceAll: (encId: string, items: Omit<Utterance, "id" | "seq">[]) =>
    tx(() => {
      run("DELETE FROM utterances WHERE encounter_id = ?", encId);
      return items.map((it, i) => insertUtt(encId, i, it));
    }),
  setSpeakers: (encId: string, map: Record<string, Utterance["speaker"]>) =>
    tx(() => {
      for (const [id, speaker] of Object.entries(map)) run("UPDATE utterances SET speaker = ? WHERE encounter_id = ? AND id = ? AND speaker_source = 'auto'", speaker, encId, id);
    }),
  update: (encId: string, id: string, patch: { speaker?: string; text?: string; redacted?: boolean }) => {
    const cur = get<UttRow>("SELECT * FROM utterances WHERE encounter_id = ? AND id = ?", encId, id);
    if (!cur) return undefined;
    run(
      "UPDATE utterances SET speaker = ?, speaker_source = ?, text = ?, redacted = ? WHERE id = ?",
      patch.speaker ?? cur.speaker, patch.speaker ? "manual" : cur.speaker_source, patch.text ?? cur.text, patch.redacted === undefined ? cur.redacted : patch.redacted ? 1 : 0, id,
    );
    return toUtt(get<UttRow>("SELECT * FROM utterances WHERE id = ?", id)!);
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
  add: (c: Omit<ConsentRecord, "id" | "createdAt"> & { userId: string }) => {
    const id = uid("con_");
    const createdAt = now();
    run(
      "INSERT INTO consents (id, encounter_id, user_id, decision, method, state, all_party, others_present, script_version, statement, digest, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, c.encounterId, c.userId, c.decision, c.method, c.state, c.allParty ? 1 : 0, c.othersPresent ? 1 : 0, c.scriptVersion, c.statement, c.digest, createdAt,
    );
    return consents.latest(c.encounterId)!;
  },
  latest: (encId: string): ConsentRecord | undefined => {
    const r = get<ConsentRow>("SELECT * FROM consents WHERE encounter_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1", encId);
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

const toNote = (r: NoteRow): NoteRecord => ({ id: r.id, version: r.version, engine: r.engine, content: j(r.content, { sections: [], meta: { engine: "local", templateId: "", generatedAt: "" } } as Note), generated: j(r.generated, { sections: [], meta: { engine: "local", templateId: "", generatedAt: "" } } as Note), status: r.status as NoteRecord["status"], createdAt: r.created_at, updatedAt: r.updated_at });

export const notes = {
  latest: (encId: string) => {
    const r = get<NoteRow>("SELECT * FROM notes WHERE encounter_id = ? ORDER BY version DESC LIMIT 1", encId);
    return r ? toNote(r) : undefined;
  },
  versions: (encId: string) => all<NoteRow>("SELECT * FROM notes WHERE encounter_id = ? ORDER BY version DESC", encId).map(toNote),
  create: (encId: string, note: Note) => {
    const v = (get<{ m: number | null }>("SELECT MAX(version) AS m FROM notes WHERE encounter_id = ?", encId)?.m ?? 0) + 1;
    const id = uid("note_");
    const t = now();
    run("INSERT INTO notes (id, encounter_id, version, template_id, engine, content, generated, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)", id, encId, v, note.meta.templateId, note.meta.engine, JSON.stringify(note), JSON.stringify(note), t, t);
    return notes.latest(encId)!;
  },
  saveContent: (encId: string, note: Note) => {
    const cur = notes.latest(encId);
    if (!cur) return undefined;
    run("UPDATE notes SET content = ?, updated_at = ? WHERE id = ?", JSON.stringify(note), now(), cur.id);
    return notes.latest(encId);
  },
  setStatus: (encId: string, status: "draft" | "signed") => {
    const cur = notes.latest(encId);
    if (cur) run("UPDATE notes SET status = ?, updated_at = ? WHERE id = ?", status, now(), cur.id);
  },
};

export const artifacts = {
  set: (encId: string, kind: string, content: unknown) =>
    run("INSERT INTO artifacts (id, encounter_id, kind, content, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(encounter_id, kind) DO UPDATE SET content = excluded.content, created_at = excluded.created_at", uid("art_"), encId, kind, JSON.stringify(content), now()),
  get: <T>(encId: string, kind: string) => {
    const r = get<{ content: string }>("SELECT content FROM artifacts WHERE encounter_id = ? AND kind = ?", encId, kind);
    return r ? j<T | undefined>(r.content, undefined) : undefined;
  },
  all: (encId: string) => Object.fromEntries(all<{ kind: string; content: string }>("SELECT kind, content FROM artifacts WHERE encounter_id = ?", encId).map((r) => [r.kind, j(r.content, null)])),
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
  list: (encId: string) => all<OrderRow>("SELECT * FROM orders WHERE encounter_id = ? ORDER BY rowid", encId).map(toOrder),
  replace: (encId: string, items: Omit<StagedOrder, "id">[]) =>
    tx(() => {
      const prior = new Map(orders.list(encId).map((o) => [o.name, o.status]));
      run("DELETE FROM orders WHERE encounter_id = ?", encId);
      for (const o of items) {
        const status = o.status === "rejected" ? "rejected" : prior.get(o.name) ?? o.status;
        run("INSERT INTO orders (id, encounter_id, kind, name, detail, status, evidence, alerts, problem, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", uid("ord_"), encId, o.kind, o.name, o.detail, status, JSON.stringify(o.evidence), JSON.stringify(o.alerts), o.problem, now());
      }
      return orders.list(encId);
    }),
  setStatus: (encId: string, id: string, status: StagedOrder["status"]) => {
    run("UPDATE orders SET status = ? WHERE encounter_id = ? AND id = ?", status, encId, id);
    return orders.list(encId).find((o) => o.id === id);
  },
};

interface TemplateRow {
  id: string;
  user_id: string | null;
  name: string;
  specialty: string;
  description: string;
  sections: string;
  style: string;
}

const toTemplate = (r: TemplateRow): Template => ({ id: r.id, userId: r.user_id, name: r.name, specialty: r.specialty, description: r.description, sections: j(r.sections, []), style: j(r.style, {}) });

export const templates = {
  list: (userId: string) => [...SYSTEM_TEMPLATES, ...all<TemplateRow>("SELECT * FROM templates WHERE user_id = ? ORDER BY created_at", userId).map(toTemplate)],
  get: (userId: string, id: string) => SYSTEM_TEMPLATES.find((t) => t.id === id) ?? (() => {
    const r = get<TemplateRow>("SELECT * FROM templates WHERE id = ? AND user_id = ?", id, userId);
    return r ? toTemplate(r) : undefined;
  })(),
  save: (userId: string, t: Omit<Template, "id" | "userId"> & { id?: string }) => {
    if (t.id && SYSTEM_TEMPLATES.some((s) => s.id === t.id)) throw new Error("System templates are read-only; duplicate it first.");
    const id = t.id ?? uid("tpl_");
    const exists = t.id ? get("SELECT id FROM templates WHERE id = ? AND user_id = ?", t.id, userId) : undefined;
    if (exists) run("UPDATE templates SET name = ?, specialty = ?, description = ?, sections = ?, style = ? WHERE id = ? AND user_id = ?", t.name, t.specialty, t.description, JSON.stringify(t.sections), JSON.stringify(t.style), id, userId);
    else run("INSERT INTO templates (id, user_id, name, specialty, description, sections, style, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, userId, t.name, t.specialty, t.description, JSON.stringify(t.sections), JSON.stringify(t.style), now());
    return templates.get(userId, id)!;
  },
  remove: (userId: string, id: string) => run("DELETE FROM templates WHERE id = ? AND user_id = ?", id, userId),
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
  list: (userId: string) => all<RuleRow>("SELECT * FROM style_rules WHERE user_id = ? ORDER BY active DESC, support DESC, created_at", userId).map(toRule),
  learn: (userId: string, c: Pick<StyleRule, "kind" | "section" | "value" | "label">, threshold = 2) => {
    const existing = get<RuleRow>("SELECT * FROM style_rules WHERE user_id = ? AND kind = ? AND section = ? AND value = ?", userId, c.kind, c.section, c.value);
    if (existing) {
      const support = existing.support + 1;
      run("UPDATE style_rules SET support = ?, active = CASE WHEN source = 'learned' AND ? >= ? THEN 1 ELSE active END WHERE id = ?", support, support, threshold, existing.id);
      return;
    }
    run("INSERT INTO style_rules (id, user_id, kind, section, value, label, source, support, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 'learned', 1, ?, ?)", uid("sty_"), userId, c.kind, c.section, c.value, c.label, threshold <= 1 ? 1 : 0, now());
  },
  addManual: (userId: string, c: Pick<StyleRule, "kind" | "section" | "value" | "label">) => {
    run("INSERT INTO style_rules (id, user_id, kind, section, value, label, source, support, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 'manual', 1, 1, ?) ON CONFLICT(user_id, kind, section, value) DO UPDATE SET active = 1, source = 'manual'", uid("sty_"), userId, c.kind, c.section, c.value, c.label, now());
  },
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

export const audit = {
  log: (userId: string | null, encId: string | null, action: string, detail: Record<string, unknown> = {}) => run("INSERT INTO audit (id, user_id, encounter_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)", uid("aud_"), userId, encId, action, JSON.stringify(detail), now()),
  forEncounter: (encId: string) => all<{ id: string; action: string; detail: string; created_at: string }>("SELECT id, action, detail, created_at FROM audit WHERE encounter_id = ? ORDER BY created_at, rowid", encId).map((r) => ({ ...r, detail: j<Record<string, unknown>>(r.detail, {}) })),
  forUser: (userId: string, since: string) => all<{ encounter_id: string; action: string; detail: string; created_at: string }>("SELECT encounter_id, action, detail, created_at FROM audit WHERE user_id = ? AND created_at >= ? ORDER BY created_at", userId, since),
};

export function encounterByShareToken(token: string) {
  const r = get<{ encounter_id: string }>("SELECT encounter_id FROM artifacts WHERE kind = 'share' AND json_extract(content, '$.token') = ?", token);
  if (!r) return undefined;
  const e = get<EncounterRow>("SELECT * FROM encounters WHERE id = ?", r.encounter_id);
  return e ? toEncounter(e) : undefined;
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
  add: (encId: string, c: Omit<AudioChunk, "id">) => {
    run("INSERT INTO audio_chunks (id, encounter_id, seq, t_ms, bytes, mime, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(encounter_id, seq) DO UPDATE SET bytes = excluded.bytes, path = excluded.path, t_ms = excluded.t_ms", uid("aud_"), encId, c.seq, c.tMs, c.bytes, c.mime, c.path, now());
  },
  list: (encId: string) => all<{ id: string; seq: number; t_ms: number; bytes: number; mime: string; path: string }>("SELECT id, seq, t_ms, bytes, mime, path FROM audio_chunks WHERE encounter_id = ? ORDER BY seq", encId).map((r) => ({ id: r.id, seq: r.seq, tMs: r.t_ms, bytes: r.bytes, mime: r.mime, path: r.path })),
  remove: (encId: string) => run("DELETE FROM audio_chunks WHERE encounter_id = ?", encId),
  expired: (before: string) => all<{ encounter_id: string }>("SELECT DISTINCT a.encounter_id FROM audio_chunks a JOIN encounters e ON e.id = a.encounter_id WHERE e.signed_at IS NOT NULL AND e.signed_at <= ?", before).map((r) => r.encounter_id),
};

export interface ClaimRecord {
  encounterId: string;
  status: "draft" | "needs_review" | "ready" | "approved" | "on_hold" | "submitted";
  content: import("../engine/billing").Claim;
  history: { at: string; action: string; note?: string }[];
  reviewerNote: string;
  updatedAt: string;
}

export const claims = {
  get: (encId: string): ClaimRecord | undefined => {
    const r = get<{ encounter_id: string; status: string; content: string; reviewer_note: string; updated_at: string }>("SELECT * FROM claims WHERE encounter_id = ?", encId);
    if (!r) return undefined;
    const c = j<{ claim: ClaimRecord["content"]; history: ClaimRecord["history"] }>(r.content, { claim: null as never, history: [] });
    return { encounterId: r.encounter_id, status: r.status as ClaimRecord["status"], content: c.claim, history: c.history ?? [], reviewerNote: r.reviewer_note, updatedAt: r.updated_at };
  },
  save: (userId: string, encId: string, status: ClaimRecord["status"], claim: ClaimRecord["content"], history: ClaimRecord["history"], note?: string) => {
    run(
      "INSERT INTO claims (encounter_id, user_id, status, content, reviewer_note, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(encounter_id) DO UPDATE SET status = excluded.status, content = excluded.content, reviewer_note = COALESCE(?, claims.reviewer_note), updated_at = excluded.updated_at",
      encId, userId, status, JSON.stringify({ claim, history }), note ?? "", now(), note ?? null,
    );
    return claims.get(encId)!;
  },
  list: (userId: string) => all<{ encounter_id: string }>("SELECT encounter_id FROM claims WHERE user_id = ? ORDER BY updated_at DESC", userId).map((r) => claims.get(r.encounter_id)!),
};
