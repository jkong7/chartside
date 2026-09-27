import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";

export interface SourceFile {
  key: string;
  url: string;
  sha256: string;
  bytes: number;
  member: string | null;
}

export interface SetMeta {
  id: string;
  kind: string;
  name: string;
  publisher: string;
  version: string;
  effective: { from: string; to: string };
  license: string;
  builtAt: string;
  sources: SourceFile[];
  stats: Record<string, number>;
}

export interface Provenance {
  set: string;
  version: string;
  name: string;
}

type NoteRef = [string] | [string, string];
type NoteEntry = [string, NoteRef[]];
interface NodeNotes {
  e1?: NoteEntry[];
  e2?: NoteEntry[];
  cf?: NoteEntry[];
  ua?: NoteEntry[];
  ca?: NoteEntry[];
  inc?: string[];
  it?: string[];
  n?: string[];
  x7n?: string[];
  x7?: Record<string, string>;
}
interface TabNode {
  p: string | null;
  t?: string;
  n?: NodeNotes;
}

interface IcdArtifact extends SetMeta {
  codes: ([string, 0 | 1, string] | [string, 0 | 1, string, string])[];
  nodes: Record<string, TabNode>;
}

export interface IcdCode {
  code: string;
  dotted: string;
  billable: boolean;
  short: string;
  long: string;
}

export interface IcdNote {
  text: string;
  refs: NoteRef[];
  at: string;
}

export interface IcdNotes {
  excludes1: IcdNote[];
  excludes2: IcdNote[];
  codeFirst: IcdNote[];
  useAdditional: IcdNote[];
  codeAlso: IcdNote[];
  sevenChar: { at: string; defs: Record<string, string> } | null;
  chapter: string | null;
  section: string | null;
}

const ROOT = process.env.CHARTSIDE_CODESETS_DIR ?? path.join(process.cwd(), "codesets");
const LICENSED_DIR = process.env.CHARTSIDE_LICENSED_DIR ?? path.join(process.env.CHARTSIDE_DATA_DIR ?? path.join(process.cwd(), "data"), "codesets/licensed");

const cache = new Map<string, unknown>();

function load<T>(id: string): T {
  const hit = cache.get(id);
  if (hit) return hit as T;
  const file = path.join(ROOT, "dist", `${id}.json.gz`);
  if (!existsSync(file)) throw new Error(`Code set ${id} is not built. Run npm run codesets:build.`);
  const data = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")) as T;
  cache.set(id, data);
  return data;
}

export const normalizeIcd = (code: string) => code.trim().toUpperCase().replace(/\./g, "");
export const dotIcd = (code: string) => {
  const c = normalizeIcd(code);
  return c.length > 3 ? `${c.slice(0, 3)}.${c.slice(3)}` : c;
};

export function refMatches(ref: NoteRef, code: string) {
  const c = normalizeIcd(code);
  if (ref.length === 1) return c.startsWith(ref[0]);
  const [from, to] = ref;
  return c.slice(0, from.length) >= from && c.slice(0, to.length) <= to;
}

export class IcdRelease {
  readonly meta: SetMeta;
  private readonly byCode = new Map<string, number>();
  private readonly codes: IcdArtifact["codes"];
  private readonly nodes: Record<string, TabNode>;

  constructor(a: IcdArtifact) {
    const { codes, nodes, ...meta } = a;
    this.meta = meta;
    this.codes = codes;
    this.nodes = nodes;
    codes.forEach((c, i) => this.byCode.set(c[0], i));
  }

  get provenance(): Provenance {
    return { set: "ICD-10-CM", version: this.meta.version, name: this.meta.name };
  }

  lookup(code: string): IcdCode | undefined {
    const i = this.byCode.get(normalizeIcd(code));
    if (i === undefined) return undefined;
    const r = this.codes[i];
    return { code: r[0], dotted: dotIcd(r[0]), billable: r[1] === 1, short: r[2], long: r[3] ?? r[2] };
  }

  descendants(code: string, billableOnly = true): IcdCode[] {
    const c = normalizeIcd(code);
    const start = this.byCode.get(c);
    if (start === undefined) return [];
    const out: IcdCode[] = [];
    for (let i = start + 1; i < this.codes.length && this.codes[i][0].startsWith(c); i++) {
      const r = this.codes[i];
      if (!billableOnly || r[1] === 1) out.push({ code: r[0], dotted: dotIcd(r[0]), billable: r[1] === 1, short: r[2], long: r[3] ?? r[2] });
    }
    return out;
  }

  parentOf(code: string): IcdCode | undefined {
    const c = normalizeIcd(code);
    for (let n = c.length - 1; n >= 3; n--) {
      const p = this.lookup(c.slice(0, n));
      if (p) return p;
    }
    return undefined;
  }

  siblings(code: string): IcdCode[] {
    const parent = this.parentOf(code);
    if (!parent) return [];
    const c = normalizeIcd(code);
    return this.descendants(parent.code).filter((x) => x.code.length === c.length);
  }

  private tabularAncestor(code: string): string | null {
    const c = normalizeIcd(code);
    for (let n = c.length; n >= 3; n--) if (this.nodes[c.slice(0, n)]) return c.slice(0, n);
    return null;
  }

  notes(code: string): IcdNotes {
    const out: IcdNotes = { excludes1: [], excludes2: [], codeFirst: [], useAdditional: [], codeAlso: [], sevenChar: null, chapter: null, section: null };
    let id = this.tabularAncestor(code);
    while (id) {
      const node: TabNode | undefined = this.nodes[id];
      if (!node) break;
      const n = node.n;
      const at = id.startsWith("sec:") ? id.slice(4) : id.startsWith("ch") ? `Chapter ${id.slice(2)}` : dotIcd(id);
      if (n) {
        const push = (list: IcdNote[], entries?: NoteEntry[]) => entries?.forEach(([text, refs]) => list.push({ text, refs, at }));
        push(out.excludes1, n.e1);
        push(out.excludes2, n.e2);
        push(out.codeFirst, n.cf);
        push(out.useAdditional, n.ua);
        push(out.codeAlso, n.ca);
        if (n.x7 && !out.sevenChar) out.sevenChar = { at, defs: n.x7 };
      }
      if (id.startsWith("sec:")) out.section = node.t ?? null;
      if (id.startsWith("ch")) out.chapter = node.t ?? null;
      id = node.p;
    }
    return out;
  }

  search(query: string, limit = 20): IcdCode[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const asCode = normalizeIcd(q);
    const out: IcdCode[] = [];
    if (/^[a-z]\d/i.test(q)) {
      const start = this.byCode.get(asCode);
      if (start !== undefined) out.push(...[this.lookup(asCode)!, ...this.descendants(asCode, false)].slice(0, limit));
      else for (const r of this.codes) if (r[0].startsWith(asCode) && out.push(this.lookup(r[0])!) >= limit) break;
      return out;
    }
    const words = q.split(/\s+/).filter(Boolean);
    for (const r of this.codes) {
      if (r[1] !== 1) continue;
      const hay = (r[3] ?? r[2]).toLowerCase();
      if (words.every((w) => hay.includes(w))) {
        out.push(this.lookup(r[0])!);
        if (out.length >= limit) break;
      }
    }
    return out;
  }
}

const ICD_RELEASES = ["icd10cm-2026-apr", "icd10cm-2027"];

export function icdReleaseFor(dos: string): IcdRelease | null {
  const d = dos.slice(0, 10);
  for (const id of ICD_RELEASES) {
    const meta = manifestEntry(id);
    if (meta && d >= meta.effective.from && d <= meta.effective.to) return icdRelease(id);
  }
  return null;
}

export function icdRelease(id: string): IcdRelease {
  const key = `release:${id}`;
  const hit = cache.get(key);
  if (hit) return hit as IcdRelease;
  const r = new IcdRelease(load<IcdArtifact>(id));
  cache.set(key, r);
  return r;
}

export function latestIcdRelease(): IcdRelease {
  return icdRelease(ICD_RELEASES[ICD_RELEASES.length - 1]);
}

interface Manifest {
  generated: string;
  sources: Record<string, { name: string; version: string; effective: { from: string; to: string }; files: Record<string, { url: string; sha256: string; bytes: number; member: string | null }>; artifact: { file: string; sha256: string; bytes: number }; stats: Record<string, number>; builtAt: string }>;
}

export function manifest(): Manifest {
  const hit = cache.get("manifest");
  if (hit) return hit as Manifest;
  const m = JSON.parse(readFileSync(path.join(ROOT, "manifest.json"), "utf8")) as Manifest;
  cache.set("manifest", m);
  return m;
}

function manifestEntry(id: string) {
  return manifest().sources[id];
}

export interface HcpcsCode {
  code: string;
  long: string;
  short: string;
  pricing: string | null;
  coverage: string | null;
  betos: string | null;
  tos: string | null;
  added: string | null;
  actionEffective: string | null;
  terminated: string | null;
  action: string | null;
}

interface HcpcsArtifact extends SetMeta {
  codes: Record<string, Omit<HcpcsCode, "code">>;
  modifiers: Record<string, { long: string; short: string; terminated: string | null }>;
}

export const hcpcs = {
  meta: () => stripData(load<HcpcsArtifact>("hcpcs-2026-oct"), ["codes", "modifiers"]),
  lookup(code: string): HcpcsCode | undefined {
    const c = code.trim().toUpperCase();
    const r = load<HcpcsArtifact>("hcpcs-2026-oct").codes[c];
    return r ? { code: c, ...r } : undefined;
  },
  modifier(mod: string) {
    return load<HcpcsArtifact>("hcpcs-2026-oct").modifiers[mod.trim().toUpperCase()];
  },
  activeOn(code: string, dos: string) {
    const r = hcpcs.lookup(code);
    if (!r) return false;
    const d = dos.slice(0, 10).replace(/-/g, "");
    if (r.added && d < r.added) return false;
    if (r.terminated && d > r.terminated) return false;
    return true;
  },
};

export interface RvuRow {
  s: string;
  w: number;
  pn: number;
  pf: number;
  mp: number;
  nfNa: 0 | 1;
  fNa: 0 | 1;
  pctc: string;
  g: string;
  mu: string;
  bi: string;
  as: string;
  co: string;
  tm: string;
  nm?: 1;
  d?: string;
}

export interface Locality {
  mac: string;
  state: string;
  locality: string;
  name: string;
  pw: number;
  pe: number;
  mp: number;
}

interface PfsArtifact extends SetMeta {
  conversionFactor: { nonQualifyingApm: number; qualifyingApm: number };
  rvu: Record<string, RvuRow>;
  gpci: Locality[];
}

export const STATUS_CODES: Record<string, string> = {
  A: "Active: paid separately under the physician fee schedule",
  B: "Bundled: payment is included in another service",
  C: "Carrier-priced",
  D: "Deleted code",
  E: "Excluded from the physician fee schedule by regulation",
  I: "Not valid for Medicare purposes; Medicare uses another code",
  J: "Anesthesia service",
  M: "Measurement code, used for reporting only",
  N: "Non-covered service",
  P: "Bundled or excluded",
  R: "Restricted coverage",
  T: "Paid only if no other paid service is billed on the same date",
  X: "Statutory exclusion",
};

export interface Price {
  code: string;
  modifier: string | null;
  status: string;
  facility: boolean;
  rvu: { work: number; pe: number; mp: number; total: number };
  gpci: { pw: number; pe: number; mp: number; locality: string; name: string; mac: string };
  conversionFactor: number;
  allowed: number;
  globalDays: string;
  payable: boolean;
  provenance: Provenance;
}

export const pfs = {
  meta: () => stripData(load<PfsArtifact>("pfs-2026-d"), ["rvu", "gpci"]),
  row(code: string, modifier?: string | null): RvuRow | undefined {
    const a = load<PfsArtifact>("pfs-2026-d");
    const c = code.trim().toUpperCase();
    return (modifier && a.rvu[`${c}-${modifier}`]) || a.rvu[c];
  },
  localities: () => load<PfsArtifact>("pfs-2026-d").gpci,
  locality(key: string): Locality {
    const all = load<PfsArtifact>("pfs-2026-d").gpci;
    const [mac, loc] = key.split(":");
    return all.find((g) => g.mac === mac && g.locality === loc) ?? all.find((g) => g.mac === mac) ?? { mac: "00000", state: "US", locality: "00", name: "National (GPCI 1.0)", pw: 1, pe: 1, mp: 1 };
  },
  conversionFactor(qualifyingApm = false) {
    const cf = load<PfsArtifact>("pfs-2026-d").conversionFactor;
    return qualifyingApm ? cf.qualifyingApm : cf.nonQualifyingApm;
  },
  price(code: string, opts: { modifier?: string | null; pos: string; locality: string; qualifyingApm?: boolean }): Price | null {
    const modifier = opts.modifier && ["26", "TC", "53"].includes(opts.modifier) ? opts.modifier : null;
    const r = pfs.row(code, modifier);
    if (!r) return null;
    const facility = pos.isFacility(opts.pos) && !r.fNa;
    const pe = facility ? r.pf : r.pn;
    const g = pfs.locality(opts.locality);
    const cf = pfs.conversionFactor(opts.qualifyingApm);
    const allowed = Math.round((r.w * g.pw + pe * g.pe + r.mp * g.mp) * cf * 100) / 100;
    const m = pfs.meta();
    return {
      code: code.toUpperCase(),
      modifier,
      status: r.s,
      facility,
      rvu: { work: r.w, pe, mp: r.mp, total: Math.round((r.w + pe + r.mp) * 100) / 100 },
      gpci: { pw: g.pw, pe: g.pe, mp: g.mp, locality: g.locality, name: g.name, mac: g.mac },
      conversionFactor: cf,
      allowed,
      globalDays: r.g,
      payable: ["A", "T", "R"].includes(r.s) && !r.nm,
      provenance: { set: "MPFS", version: m.version, name: m.name },
    };
  },
};

interface AspArtifact extends SetMeta {
  limits: Record<string, { dosage: string | null; limit: number; coinsurance: number; vaccine: boolean; d?: string; note?: string }>;
  notPayable: Record<string, string>;
}

interface ClfsArtifact extends SetMeta {
  rates: Record<string, { rate: number; indicator: string; eff: string; d?: string }>;
}

export const partB = {
  meta: () => stripData(load<AspArtifact>("asp-2026-oct"), ["limits", "notPayable"]),
  limit(code: string) {
    return load<AspArtifact>("asp-2026-oct").limits[code.trim().toUpperCase()];
  },
  notPayable(code: string) {
    return load<AspArtifact>("asp-2026-oct").notPayable[code.trim().toUpperCase()];
  },
};

export const clfs = {
  meta: () => stripData(load<ClfsArtifact>("clfs-2026-q4"), ["rates"]),
  rate(code: string, modifier?: string | null) {
    const r = load<ClfsArtifact>("clfs-2026-q4").rates;
    const c = code.trim().toUpperCase();
    return (modifier && r[`${c}-${modifier}`]) || r[c];
  },
};

interface VaxAdminArtifact extends SetMeta {
  national: Record<string, number>;
  localities: Record<string, Record<string, number>>;
}

export const vaccineAdmin = {
  meta: () => stripData(load<VaxAdminArtifact>("vaxadmin-2026"), ["national", "localities"]),
  rate(code: string, locality: string) {
    const a = load<VaxAdminArtifact>("vaxadmin-2026");
    return a.localities[locality]?.[code] ?? a.national[code];
  },
};

interface HccArtifact extends SetMeta {
  segments: string[];
  mapping: Record<string, ([string] | [string, string | null, string | null, string | null])[]>;
  hierarchies: Record<string, string[]>;
  categories: Record<string, string[]>;
  interactions: Record<string, string[]>;
  factors: Record<string, Record<string, number | null>>;
  labels: Record<string, string>;
}

export type HccSegment = "COMMUNITY_NA" | "COMMUNITY_PBA" | "COMMUNITY_FBA" | "COMMUNITY_ND" | "COMMUNITY_PBD" | "COMMUNITY_FBD" | "INSTITUTIONAL";

export const SEGMENT_LABEL: Record<HccSegment, string> = {
  COMMUNITY_NA: "Community, non-dual, aged",
  COMMUNITY_PBA: "Community, partial dual, aged",
  COMMUNITY_FBA: "Community, full dual, aged",
  COMMUNITY_ND: "Community, non-dual, disabled",
  COMMUNITY_PBD: "Community, partial dual, disabled",
  COMMUNITY_FBD: "Community, full dual, disabled",
  INSTITUTIONAL: "Long-term institutional",
};

export interface RiskScore {
  segment: HccSegment;
  demographic: { variable: string; label: string; factor: number };
  hccs: { hcc: string; label: string; factor: number; codes: string[]; droppedBy?: string }[];
  interactions: { variable: string; label: string; factor: number }[];
  count: { variable: string; label: string; factor: number } | null;
  total: number;
  provenance: Provenance;
  note: string;
}

export function ageRule(rule: string, age: number) {
  const r = rule.replace(/\s+/g, " ").trim();
  const between = r.match(/^(\d+) <= age <= (\d+)$/);
  if (between) return age >= Number(between[1]) && age <= Number(between[2]);
  const m = r.match(/^age (<=|>=|<|>|=) (\d+)$/);
  if (!m) return true;
  const n = Number(m[2]);
  return m[1] === "<" ? age < n : m[1] === "<=" ? age <= n : m[1] === ">" ? age > n : m[1] === ">=" ? age >= n : age === n;
}

function ageBand(age: number) {
  const bands: [number, number][] = [[0, 34], [35, 44], [45, 54], [55, 59], [60, 64], [65, 69], [70, 74], [75, 79], [80, 84], [85, 89], [90, 94]];
  for (const [lo, hi] of bands) if (age >= lo && age <= hi) return `${lo}_${hi}`;
  return "95_GT";
}

export const hcc = {
  meta: () => stripData(load<HccArtifact>("hcc-v28-2026"), ["mapping", "hierarchies", "categories", "interactions", "factors", "labels"]),
  forCode(code: string, patient?: { age?: number; sex?: string }): string[] {
    const a = load<HccArtifact>("hcc-v28-2026");
    const rows = a.mapping[normalizeIcd(code)] ?? [];
    const sexCode = patient?.sex ? (/^m/i.test(patient.sex) ? "1" : "2") : null;
    const out: string[] = [];
    for (const [h, mce, age, sex] of rows) {
      if (patient?.age !== undefined) {
        if (mce && !ageRule(mce, patient.age)) continue;
        if (age && !ageRule(age, patient.age)) continue;
      } else if (age) continue;
      if (sex && sexCode && sex !== sexCode) continue;
      if (a.hierarchies[h] && !out.includes(h)) out.push(h);
    }
    return out;
  },
  mapsToHcc: (code: string) => (load<HccArtifact>("hcc-v28-2026").mapping[normalizeIcd(code)] ?? []).length > 0,
  label: (h: string) => load<HccArtifact>("hcc-v28-2026").labels[h] ?? h,
  score(codes: string[], opts: { age: number; sex: string; segment?: HccSegment }): RiskScore {
    const a = load<HccArtifact>("hcc-v28-2026");
    const segment = opts.segment ?? (opts.age >= 65 ? "COMMUNITY_NA" : "COMMUNITY_ND");
    const f = (v: string) => a.factors[v]?.[segment] ?? 0;
    const sexKey = /^m/i.test(opts.sex) ? "M" : "F";
    const demoVar = `${sexKey}${ageBand(opts.age)}`;
    const byHcc = new Map<string, string[]>();
    for (const c of codes) for (const h of hcc.forCode(c, { age: opts.age, sex: opts.sex })) byHcc.set(h, [...(byHcc.get(h) ?? []), dotIcd(c)]);
    const present = new Set(byHcc.keys());
    const dropped = new Map<string, string>();
    for (const h of present) for (const lower of a.hierarchies[h] ?? []) if (present.has(lower)) dropped.set(lower, h);
    const kept = [...present].filter((h) => !dropped.has(h));
    const hccs = [...present].map((h) => ({ hcc: h, label: a.labels[h] ?? h, factor: dropped.has(h) ? 0 : f(h), codes: byHcc.get(h)!, ...(dropped.has(h) ? { droppedBy: dropped.get(h) } : {}) }));
    const groups = new Set(Object.entries(a.categories).filter(([, list]) => list.some((h) => kept.includes(h))).map(([g]) => g));
    for (const h of kept) groups.add(h);
    const interactions = Object.entries(a.interactions)
      .filter(([v, parts]) => !v.startsWith("DISABLED") && parts.every((p) => groups.has(p)))
      .map(([v]) => ({ variable: v, label: a.labels[v] ?? v, factor: f(v) }))
      .filter((x) => x.factor);
    const n = kept.length;
    const countVar = n >= 10 ? "D10P" : n >= 1 ? `D${n}` : null;
    const count = countVar && a.factors[countVar] ? { variable: countVar, label: a.labels[countVar] ?? countVar, factor: f(countVar) } : null;
    const demographic = { variable: demoVar, label: a.labels[demoVar] ?? demoVar, factor: f(demoVar) };
    const total = Math.round((demographic.factor + hccs.reduce((s, x) => s + x.factor, 0) + interactions.reduce((s, x) => s + x.factor, 0) + (count?.factor ?? 0)) * 1000) / 1000;
    const m = hcc.meta();
    return { segment, demographic, hccs, interactions, count, total, provenance: { set: "CMS-HCC", version: m.version, name: m.name }, note: "Raw relative factor sum before the CMS normalization factor and MA coding-pattern adjustment; excludes Medicaid, originally-disabled, and new-enrollee variables." };
  },
};

interface PosCode {
  code: string;
  name: string;
  facility: boolean;
}

export const pos = {
  all(): PosCode[] {
    const hit = cache.get("pos");
    if (hit) return hit as PosCode[];
    const data = JSON.parse(readFileSync(path.join(ROOT, "pos.json"), "utf8")) as { codes: PosCode[] };
    cache.set("pos", data.codes);
    return data.codes;
  },
  get: (code: string) => pos.all().find((p) => p.code === code),
  isFacility: (code: string) => !!pos.get(code)?.facility,
  meta: () => {
    const { codes: _codes, ...m } = JSON.parse(readFileSync(path.join(ROOT, "pos.json"), "utf8"));
    return m as { id: string; name: string; publisher: string; source: string; retrieved: string; facilityRateSource: string; license: string };
  },
};

function stripData<T extends SetMeta>(a: T, keys: string[]): SetMeta {
  const out = { ...a } as Record<string, unknown>;
  for (const k of keys) delete out[k];
  return out as unknown as SetMeta;
}

export interface LicensedManifest {
  acceptedAt: string;
  acceptedBy: string;
  terms: string[];
  sources: Record<string, { name: string; version: string; effective: { from: string; to: string }; files: Record<string, { url: string; sha256: string; bytes: number }>; rows?: number | Record<string, number> }>;
}

let licensedDb: DatabaseSync | null | undefined;

function licensed(): DatabaseSync | null {
  if (licensedDb !== undefined) return licensedDb;
  const file = path.join(LICENSED_DIR, "licensed.db");
  licensedDb = existsSync(file) ? new DatabaseSync(file, { readOnly: true }) : null;
  return licensedDb;
}

export function resetCodesetCache() {
  cache.clear();
  licensedDb?.close();
  licensedDb = undefined;
}

export interface PtpEdit {
  column1: string;
  column2: string;
  modifierIndicator: 0 | 1 | 9;
  effective: string;
  deleted: string | null;
  rationale: string | null;
}

export const ncci = {
  loaded: () => !!licensed(),
  manifest(): LicensedManifest | null {
    const db = licensed();
    if (!db) return null;
    const r = db.prepare("SELECT content FROM meta WHERE id = 'manifest'").get() as { content: string } | undefined;
    return r ? (JSON.parse(r.content) as LicensedManifest) : null;
  },
  ptp(a: string, b: string, dos: string): PtpEdit | null {
    const db = licensed();
    if (!db) return null;
    const d = dos.slice(0, 10).replace(/-/g, "");
    const rows = db.prepare("SELECT col1, col2, eff, del, modifier, rationale FROM ptp WHERE (col1 = ? AND col2 = ?) OR (col1 = ? AND col2 = ?)").all(a, b, b, a) as { col1: string; col2: string; eff: string; del: string | null; modifier: number; rationale: string | null }[];
    const hit = rows.find((r) => r.eff <= d && (!r.del || r.del >= d));
    return hit ? { column1: hit.col1, column2: hit.col2, modifierIndicator: hit.modifier as 0 | 1 | 9, effective: hit.eff, deleted: hit.del, rationale: hit.rationale } : null;
  },
  mue(code: string): { value: number; mai: 1 | 2 | 3; rationale: string | null } | null {
    const db = licensed();
    if (!db) return null;
    const r = db.prepare("SELECT value, mai, rationale FROM mue WHERE code = ?").get(code) as { value: number; mai: number; rationale: string | null } | undefined;
    return r ? { value: r.value, mai: r.mai as 1 | 2 | 3, rationale: r.rationale } : null;
  },
  coverageArticles(code: string, macNumber: string, dos: string) {
    const db = licensed();
    if (!db) return [];
    const d = dos.slice(0, 10);
    const rows = db.prepare(`
      SELECT DISTINCT a.id, a.display_id, a.title, a.eff, a.end_date, h.grp, c.contractor_name
      FROM article_hcpc h
      JOIN article a ON a.id = h.article_id
      JOIN article_contractor c ON c.article_id = a.id
      WHERE h.code = ? AND c.contractor_number = ? AND (a.eff IS NULL OR a.eff <= ?) AND (a.end_date IS NULL OR a.end_date >= ?)
    `).all(code, macNumber, d, d) as { id: string; display_id: string; title: string; eff: string; end_date: string | null; grp: string; contractor_name: string }[];
    return rows.map((r) => {
      const covered = db.prepare("SELECT COUNT(*) AS n FROM article_icd WHERE article_id = ? AND grp = ?").get(r.id, r.grp) as { n: number };
      return { ...r, coveredCount: covered.n };
    });
  },
  articleCovers(articleId: string, group: string, icd: string) {
    const db = licensed();
    if (!db) return false;
    return !!db.prepare("SELECT 1 FROM article_icd WHERE article_id = ? AND grp = ? AND code = ?").get(articleId, group, normalizeIcd(icd));
  },
};

export function codesetStatus() {
  const m = manifest();
  const lic = ncci.manifest();
  return {
    public: Object.entries(m.sources).map(([id, s]) => ({ id, name: s.name, version: s.version, effective: s.effective, stats: s.stats, builtAt: s.builtAt, artifact: s.artifact, files: Object.values(s.files).map((f) => ({ url: f.url, sha256: f.sha256, bytes: f.bytes, member: f.member })) })),
    pos: pos.meta(),
    licensed: lic
      ? { loaded: true, acceptedAt: lic.acceptedAt, acceptedBy: lic.acceptedBy, terms: lic.terms, sources: Object.entries(lic.sources).map(([id, s]) => ({ id, name: s.name, version: s.version, effective: s.effective, rows: s.rows, files: Object.values(s.files) })) }
      : { loaded: false as const },
  };
}
