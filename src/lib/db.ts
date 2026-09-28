import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Pool, PoolClient } from "pg";

const TABLES = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  specialty TEXT NOT NULL DEFAULT 'Family Medicine',
  prefs TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memberships (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
CREATE TABLE IF NOT EXISTS invites (
  token TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  created_by TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oidc_logins (
  state TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  next TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sso_identities (
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  last_login_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (issuer, subject)
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT,
  mrn TEXT NOT NULL,
  name TEXT NOT NULL,
  dob TEXT NOT NULL,
  sex TEXT NOT NULL,
  pronouns TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'en',
  chart TEXT NOT NULL DEFAULT '{}',
  external_system TEXT,
  external_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS encounters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT,
  patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
  scheduled_at TEXT NOT NULL,
  visit_type TEXT NOT NULL DEFAULT 'follow-up',
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled',
  template_id TEXT,
  setting TEXT NOT NULL DEFAULT 'in-person',
  input_lang TEXT NOT NULL DEFAULT 'en',
  output_lang TEXT NOT NULL DEFAULT 'en',
  started_at TEXT,
  ended_at TEXT,
  duration_s INTEGER NOT NULL DEFAULT 0,
  signed_at TEXT,
  external_system TEXT,
  external_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  method TEXT NOT NULL,
  state TEXT NOT NULL,
  all_party INTEGER NOT NULL,
  others_present INTEGER NOT NULL DEFAULT 0,
  script_version TEXT NOT NULL,
  statement TEXT NOT NULL,
  digest TEXT NOT NULL,
  ord BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS utterances (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  speaker TEXT NOT NULL,
  speaker_source TEXT NOT NULL DEFAULT 'auto',
  text TEXT NOT NULL,
  t_start REAL NOT NULL DEFAULT 0,
  t_end REAL NOT NULL DEFAULT 0,
  lang TEXT NOT NULL DEFAULT 'en',
  redacted INTEGER NOT NULL DEFAULT 0,
  voice TEXT,
  confidence REAL,
  source TEXT NOT NULL DEFAULT 'live'
);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  template_id TEXT,
  engine TEXT NOT NULL,
  content TEXT NOT NULL,
  generated TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(encounter_id, kind)
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'staged',
  evidence TEXT NOT NULL DEFAULT '[]',
  alerts TEXT NOT NULL DEFAULT '[]',
  problem TEXT NOT NULL DEFAULT '',
  ord BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  org_id TEXT,
  shared INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL DEFAULT 'General',
  description TEXT NOT NULL DEFAULT '',
  sections TEXT NOT NULL,
  style TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS style_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  section TEXT NOT NULL DEFAULT '*',
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'learned',
  support INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, kind, section, value)
);
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patient_flags (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  comment TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  org_id TEXT,
  encounter_id TEXT,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}',
  ord BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audio_chunks (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  t_ms INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  mime TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(encounter_id, seq)
);
CREATE TABLE IF NOT EXISTS claims (
  encounter_id TEXT PRIMARY KEY REFERENCES encounters(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  content TEXT NOT NULL,
  reviewer_note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS smart_launches (
  state TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  iss TEXT NOT NULL,
  launch TEXT,
  verifier TEXT NOT NULL,
  token_endpoint TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS addenda (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  prev_digest TEXT NOT NULL,
  digest TEXT NOT NULL,
  filing TEXT,
  ord BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  encounter_id TEXT REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
  message_id TEXT,
  assignee_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  evidence TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'auto',
  created_by TEXT,
  completed_by TEXT,
  completed_at TEXT,
  ord BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id TEXT,
  assignee_id TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'portal',
  triage TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new',
  draft TEXT,
  draft_meta TEXT,
  reply TEXT,
  replied_by TEXT,
  replied_at TEXT,
  ord BIGINT NOT NULL DEFAULT 0,
  received_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS snippets (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  shared INTEGER NOT NULL DEFAULT 0,
  trigger TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vocabulary (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  shared INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,
  term TEXT NOT NULL,
  replacement TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  fields TEXT NOT NULL DEFAULT '{}',
  body TEXT NOT NULL,
  custom INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  shared INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  evidence TEXT NOT NULL DEFAULT '[]',
  created_by TEXT,
  signed_by TEXT,
  signed_at TEXT,
  ord BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admissions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  attending_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  unit TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  admit_at TEXT NOT NULL,
  discharge_at TEXT,
  handoff TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS nursing_notes (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  admission_id TEXT NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  text TEXT NOT NULL,
  rows TEXT NOT NULL DEFAULT '[]',
  care TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  recorded_at TEXT NOT NULL,
  filed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS flowsheet (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  admission_id TEXT NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  note_id TEXT,
  group_name TEXT NOT NULL,
  row_name TEXT NOT NULL,
  value TEXT NOT NULL,
  abnormal INTEGER NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL,
  filed_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL UNIQUE,
  hash TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  response_code INTEGER,
  error TEXT,
  next_attempt_at TEXT NOT NULL,
  delivered_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mfa_challenges (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS note_revisions (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  note_version INTEGER NOT NULL,
  author_id TEXT,
  source TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  ord BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS qa_reviews (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  clinician_id TEXT NOT NULL,
  reviewer_id TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  scores TEXT,
  comment TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS golden_cases (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  transcript TEXT NOT NULL,
  chart TEXT,
  expected TEXT NOT NULL,
  last_run TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS outside_records (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  format TEXT NOT NULL,
  text TEXT NOT NULL,
  findings TEXT NOT NULL,
  uploaded_by TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ehr_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  iss TEXT NOT NULL,
  token_endpoint TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  patient TEXT,
  encounter TEXT,
  fhir_user TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const INDEXES = [
  "CREATE INDEX IF NOT EXISTS utterances_enc ON utterances(encounter_id, seq)",
  "CREATE INDEX IF NOT EXISTS notes_enc ON notes(encounter_id, version)",
  "CREATE INDEX IF NOT EXISTS audit_enc ON audit(encounter_id, ord)",
  "CREATE INDEX IF NOT EXISTS audit_org ON audit(org_id, created_at)",
  "CREATE INDEX IF NOT EXISTS encounters_org ON encounters(org_id, scheduled_at)",
  "CREATE INDEX IF NOT EXISTS patients_org ON patients(org_id)",
  "CREATE INDEX IF NOT EXISTS memberships_user ON memberships(user_id)",
  "CREATE INDEX IF NOT EXISTS addenda_enc ON addenda(encounter_id, ord)",
  "CREATE INDEX IF NOT EXISTS tasks_assignee ON tasks(org_id, assignee_id, status)",
  "CREATE UNIQUE INDEX IF NOT EXISTS tasks_enc_key ON tasks(encounter_id, key)",
  "CREATE INDEX IF NOT EXISTS revisions_enc ON note_revisions(encounter_id, ord)",
  "CREATE INDEX IF NOT EXISTS deliveries_due ON webhook_deliveries(status, next_attempt_at)",
  "CREATE INDEX IF NOT EXISTS flowsheet_adm ON flowsheet(admission_id, recorded_at)",
  "CREATE INDEX IF NOT EXISTS admissions_org ON admissions(org_id, status)",
  "CREATE INDEX IF NOT EXISTS documents_enc ON documents(encounter_id, ord)",
  "CREATE INDEX IF NOT EXISTS snippets_org ON snippets(org_id, user_id)",
  "CREATE INDEX IF NOT EXISTS vocabulary_org ON vocabulary(org_id, user_id)",
  "CREATE INDEX IF NOT EXISTS messages_assignee ON messages(org_id, assignee_id, status)",
];

const LEGACY_COLUMNS: [string, string, string][] = [
  ["patients", "external_system", "TEXT"],
  ["patients", "external_id", "TEXT"],
  ["patients", "org_id", "TEXT"],
  ["encounters", "external_system", "TEXT"],
  ["encounters", "external_id", "TEXT"],
  ["encounters", "org_id", "TEXT"],
  ["utterances", "voice", "TEXT"],
  ["utterances", "confidence", "REAL"],
  ["utterances", "source", "TEXT NOT NULL DEFAULT 'live'"],
  ["consents", "ord", "BIGINT NOT NULL DEFAULT 0"],
  ["orders", "ord", "BIGINT NOT NULL DEFAULT 0"],
  ["audit", "ord", "BIGINT NOT NULL DEFAULT 0"],
  ["audit", "org_id", "TEXT"],
  ["templates", "org_id", "TEXT"],
  ["templates", "shared", "INTEGER NOT NULL DEFAULT 0"],
  ["auth_sessions", "org_id", "TEXT"],
  ["memberships", "credential", "TEXT NOT NULL DEFAULT ''"],
  ["encounters", "admission_id", "TEXT"],
  ["admissions", "care", "TEXT NOT NULL DEFAULT '[]'"],
  ["users", "mfa_secret", "TEXT"],
  ["users", "mfa_enabled_at", "TEXT"],
  ["users", "mfa_recovery", "TEXT"],
  ["auth_sessions", "created_at", "TEXT"],
  ["auth_sessions", "last_seen_at", "TEXT"],
  ["auth_sessions", "user_agent", "TEXT"],
  ["memberships", "supervisor_id", "TEXT"],
];

export type Param = string | number | null | boolean;

interface Driver {
  kind: "sqlite" | "postgres";
  query<T>(sql: string, params: Param[], client?: unknown): Promise<{ rows: T[]; changes: number }>;
  exec(sql: string, client?: unknown): Promise<void>;
  begin(): Promise<unknown>;
  end(client: unknown, ok: boolean): Promise<void>;
  close(): Promise<void>;
}

class Mutex {
  private tail: Promise<void> = Promise.resolve();
  lock() {
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    const prev = this.tail;
    this.tail = prev.then(() => next);
    return prev.then(() => release);
  }
}

class SqliteDriver implements Driver {
  kind = "sqlite" as const;
  private mutex = new Mutex();
  constructor(private conn: DatabaseSync) {}
  async query<T>(sql: string, params: Param[]) {
    const p = params.map((x) => (typeof x === "boolean" ? (x ? 1 : 0) : x));
    const stmt = this.conn.prepare(sql);
    if (/^\s*(select|with)\b/i.test(sql) || /\breturning\b/i.test(sql)) return { rows: stmt.all(...p) as T[], changes: 0 };
    const r = stmt.run(...p);
    return { rows: [] as T[], changes: Number(r.changes) };
  }
  async exec(sql: string) {
    this.conn.exec(sql);
  }
  async begin() {
    const release = await this.mutex.lock();
    this.conn.exec("BEGIN");
    return release;
  }
  async end(release: unknown, ok: boolean) {
    try {
      this.conn.exec(ok ? "COMMIT" : "ROLLBACK");
    } finally {
      (release as () => void)();
    }
  }
  async waitIdle() {
    const release = await this.mutex.lock();
    release();
  }
  async close() {
    this.conn.close();
  }
}

function toPg(sql: string) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

class PgDriver implements Driver {
  kind = "postgres" as const;
  constructor(private pool: Pool) {}
  async query<T>(sql: string, params: Param[], client?: unknown) {
    const target = (client as PoolClient | undefined) ?? this.pool;
    const r = await target.query(toPg(sql), params);
    return { rows: r.rows as T[], changes: r.rowCount ?? 0 };
  }
  async exec(sql: string, client?: unknown) {
    await ((client as PoolClient | undefined) ?? this.pool).query(sql);
  }
  async begin() {
    const c = await this.pool.connect();
    await c.query("BEGIN");
    return c;
  }
  async end(client: unknown, ok: boolean) {
    const c = client as PoolClient;
    try {
      await c.query(ok ? "COMMIT" : "ROLLBACK");
    } finally {
      c.release();
    }
  }
  async close() {
    await this.pool.end();
  }
}

const g = globalThis as unknown as { __chartsideDb?: Promise<Driver> };
const txStore = new AsyncLocalStorage<unknown>();

export function dbKind(): "sqlite" | "postgres" {
  return process.env.DATABASE_URL ? "postgres" : "sqlite";
}

export function dataDir() {
  const file = dbPath();
  return file === ":memory:" ? path.join(process.cwd(), "data") : path.dirname(file);
}

export function dbPath() {
  return process.env.CHARTSIDE_DB ?? path.join(process.cwd(), "data", "chartside.db");
}

async function connect(): Promise<Driver> {
  if (process.env.DATABASE_URL) {
    const pg = await import("pg");
    pg.default.types.setTypeParser(20, (v: string) => Number(v));
    pg.default.types.setTypeParser(1700, (v: string) => Number(v));
    const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.PG_POOL_MAX ?? 10) });
    const d = new PgDriver(pool);
    await migrate(d);
    return d;
  }
  const { DatabaseSync: Sqlite } = await import("node:sqlite");
  const file = dbPath();
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const conn = new Sqlite(file);
  conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const d = new SqliteDriver(conn);
  await migrate(d);
  return d;
}

async function migrate(d: Driver) {
  const ddl = d.kind === "postgres" ? TABLES.replace(/\bREAL\b/g, "DOUBLE PRECISION") : TABLES;
  for (const stmt of ddl.split(";").map((s) => s.trim()).filter(Boolean)) await d.exec(stmt);
  for (const [table, col, type] of LEGACY_COLUMNS) {
    const t = d.kind === "postgres" ? type.replace(/\bREAL\b/g, "DOUBLE PRECISION") : type;
    if (d.kind === "postgres") await d.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${t}`);
    else {
      try {
        await d.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${t}`);
      } catch {
        continue;
      }
    }
  }
  for (const i of INDEXES) await d.exec(i);
  await backfillOrgs(d);
}

async function backfillOrgs(d: Driver) {
  const orphans = (await d.query<{ id: string; name: string }>("SELECT u.id, u.name FROM users u WHERE NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id)", [])).rows;
  for (const u of orphans) {
    const orgId = uid("org_");
    const ts = now();
    await d.query("INSERT INTO organizations (id, name, slug, settings, created_at) VALUES (?, ?, ?, ?, ?)", [orgId, `${u.name}'s practice`, `${slugify(u.name)}-${orgId.slice(-6)}`, "{}", ts]);
    await d.query("INSERT INTO memberships (org_id, user_id, role, status, created_at) VALUES (?, ?, 'owner', 'active', ?)", [orgId, u.id, ts]);
    for (const t of ["patients", "encounters", "templates"]) await d.query(`UPDATE ${t} SET org_id = ? WHERE user_id = ? AND org_id IS NULL`, [orgId, u.id]);
  }
}

export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org";
}

function driver() {
  g.__chartsideDb ??= connect();
  return g.__chartsideDb;
}

export async function all<T>(sql: string, ...params: Param[]): Promise<T[]> {
  const d = await driver();
  const client = txStore.getStore();
  if (client === undefined && d instanceof SqliteDriver) await d.waitIdle();
  return (await d.query<T>(sql, params, client)).rows;
}

export async function get<T>(sql: string, ...params: Param[]): Promise<T | undefined> {
  return (await all<T>(sql, ...params))[0];
}

export async function run(sql: string, ...params: Param[]) {
  const d = await driver();
  const client = txStore.getStore();
  if (client === undefined && d instanceof SqliteDriver) await d.waitIdle();
  return { changes: (await d.query(sql, params, client)).changes };
}

export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore() !== undefined) return fn();
  const d = await driver();
  const client = await d.begin();
  try {
    const out = await txStore.run(client ?? null, fn);
    await d.end(client, true);
    return out;
  } catch (err) {
    await d.end(client, false);
    throw err;
  }
}

export function jsonText(column: string, key: string) {
  return dbKind() === "postgres" ? `(${column}::jsonb ->> '${key}')` : `json_extract(${column}, '$.${key}')`;
}

export async function closeDb() {
  const p = g.__chartsideDb;
  g.__chartsideDb = undefined;
  if (p) await (await p).close();
}

export async function ready() {
  await driver();
}

export function uid(prefix = "") {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

let ordCounter = 0;
export function nextOrd() {
  ordCounter = (ordCounter + 1) % 1000;
  return Date.now() * 1000 + ordCounter;
}

export function now() {
  return new Date().toISOString();
}
