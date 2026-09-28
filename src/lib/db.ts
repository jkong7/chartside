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
