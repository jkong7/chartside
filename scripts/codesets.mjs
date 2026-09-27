import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SOURCES = JSON.parse(readFileSync(path.join(ROOT, "codesets/sources.json"), "utf8"));
const DIST = path.join(ROOT, "codesets/dist");
const LOCK = path.join(ROOT, "codesets/manifest.json");
const DATA = path.resolve(process.env.CHARTSIDE_DATA_DIR ?? path.join(ROOT, "data"));
const CACHE = path.join(DATA, "codesets/cache");
const LICENSED = path.join(DATA, "codesets/licensed");

const args = new Set(process.argv.slice(2));
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const log = (...m) => console.log("[codesets]", ...m);

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function download(url) {
  mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, createHash("sha1").update(url).digest("hex").slice(0, 16) + path.extname(new URL(url).pathname));
  if (existsSync(file) && !args.has("--refresh")) return { file, buf: readFileSync(file) };
  log("downloading", url);
  const res = await fetch(url, { headers: { "user-agent": "chartside-codesets/1.0" }, redirect: "follow" });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 2).toString() !== "PK") throw new Error(`${url} did not return a zip archive`);
  writeFileSync(file, buf);
  return { file, buf };
}

function listZip(file) {
  return execFileSync("unzip", ["-Z1", file], { maxBuffer: 1 << 26 }).toString().split("\n").filter(Boolean);
}

function readMember(file, member, opts = {}) {
  const names = listZip(file);
  const hit = names.find((n) => n === member || n.endsWith(`/${member}`)) ?? (opts.pattern ? names.find((n) => opts.pattern.test(n)) : undefined);
  if (!hit) throw new Error(`${member ?? opts.pattern} not found in ${path.basename(file)} (has: ${names.slice(0, 12).join(", ")})`);
  return { name: hit, buf: execFileSync("unzip", ["-p", file, hit], { maxBuffer: 1 << 30 }) };
}

const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, "utf8")) : { generated: null, sources: {} };

async function fetchSource(src) {
  const files = {};
  for (const [key, f] of Object.entries(src.files)) {
    const { file, buf } = await download(f.url);
    const hash = sha256(buf);
    const pinned = lock.sources[src.id]?.files?.[key];
    if (pinned && pinned.url === f.url && pinned.sha256 !== hash && !args.has("--update")) {
      throw new Error(`${src.id}/${key}: downloaded file hash ${hash} does not match the pinned ${pinned.sha256}. CMS may have re-posted the file. Review it, then rerun with --update.`);
    }
    files[key] = { url: f.url, file, sha256: hash, bytes: buf.length, member: f.member ?? null };
  }
  return files;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const CODE_TOKEN = /[A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{0,4})?-?/g;

function refsOf(note) {
  const refs = [];
  for (const m of note.matchAll(/\(([^()]*)\)/g)) {
    for (const part of m[1].split(/,|;|\band\b/)) {
      const range = part.match(/([A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{0,4})?)-?\.?-?\s*-\s*([A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{0,4})?)/);
      if (range) {
        refs.push([range[1].replace(/[.-]/g, ""), range[2].replace(/[.-]/g, "")]);
        continue;
      }
      for (const t of part.match(CODE_TOKEN) ?? []) refs.push([t.replace(/[.-]/g, "")]);
    }
  }
  return refs;
}

const NOTE_KINDS = { excludes1: "e1", excludes2: "e2", codeFirst: "cf", useAdditionalCode: "ua", codeAlso: "ca", includes: "inc", inclusionTerm: "it", sevenChrNote: "x7n", notes: "n" };

function parseTabular(xml) {
  const nodes = {};
  const stack = [];
  let chapter = 0;
  let noteKind = null;
  let text = "";
  let pendingName = null;
  let extChar = null;
  const cur = () => stack[stack.length - 1];
  const re = /<(\/?)([A-Za-z0-9]+)([^>]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[4] !== undefined) { text += m[4]; continue; }
    const [, close, tag, attrs] = m;
    if (!close) {
      text = "";
      if (tag === "chapter") {
        chapter++;
        stack.push({ id: `ch${chapter}`, kind: "chapter" });
      } else if (tag === "section") {
        const id = attrs.match(/id="([^"]+)"/)?.[1] ?? `sec${Object.keys(nodes).length}`;
        stack.push({ id: `sec:${id}`, kind: "section" });
        nodes[`sec:${id}`] = { p: cur() ? stack[stack.length - 2].id : null };
      } else if (tag === "diag") {
        stack.push({ id: null, kind: "diag", parent: cur()?.id ?? null });
      } else if (NOTE_KINDS[tag] && cur()) {
        noteKind = NOTE_KINDS[tag];
      } else if (tag === "sevenChrDef") {
        noteKind = "x7";
      } else if (tag === "extension") {
        extChar = attrs.match(/char="([^"]+)"/)?.[1] ?? null;
      }
      continue;
    }
    const node = cur();
    const value = text.replace(/\s+/g, " ").trim();
    text = "";
    if (tag === "name" && node?.kind === "diag" && !node.id) {
      node.id = value.replace(/\./g, "");
      nodes[node.id] = { p: node.parent };
      pendingName = node.id;
    } else if (tag === "desc" && node?.kind === "chapter" && !nodes[node.id]) {
      nodes[node.id] = { p: null, t: value };
    } else if (tag === "desc" && node?.kind === "section") {
      nodes[node.id].t = value;
    } else if (tag === "note" && noteKind && noteKind !== "x7" && node) {
      const target = nodes[node.id] ?? (nodes[node.id] = { p: null });
      target.n ??= {};
      (target.n[noteKind] ??= []).push(noteKind === "it" || noteKind === "inc" || noteKind === "n" || noteKind === "x7n" ? value : [value, refsOf(value)]);
    } else if (tag === "extension" && node) {
      const target = nodes[node.id];
      target.n ??= {};
      (target.n.x7 ??= {})[extChar] = value;
      extChar = null;
    } else if (NOTE_KINDS[tag] || tag === "sevenChrDef") {
      noteKind = null;
    } else if (tag === "diag" || tag === "section" || tag === "chapter") {
      stack.pop();
    }
  }
  return { nodes, chapters: chapter, lastName: pendingName };
}

function parseOrder(text) {
  const codes = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.length < 17) continue;
    const code = line.slice(6, 13).trim();
    const billable = line[14] === "1" ? 1 : 0;
    const short = line.slice(16, 76).trim();
    const long = line.slice(77).trim();
    codes.push(long && long !== short ? [code, billable, short, long] : [code, billable, short]);
  }
  return codes;
}

async function buildIcd(src) {
  const files = await fetchSource(src);
  const order = readMember(files.order.file, src.files.order.member);
  const tab = readMember(files.tabular.file, src.files.tabular.member);
  const codes = parseOrder(order.buf.toString("latin1"));
  const { nodes, chapters } = parseTabular(tab.buf.toString("utf8"));
  const billable = codes.filter((c) => c[1] === 1).length;
  if (billable < 70000 || chapters < 21) throw new Error(`${src.id}: unexpected parse result (${billable} billable codes, ${chapters} chapters)`);
  const out = { ...meta(src, files, { order: order.name, tabular: tab.name }), stats: { codes: codes.length, billable, headers: codes.length - billable, tabularNodes: Object.keys(nodes).length }, codes, nodes };
  return out;
}

async function buildHcpcs(src) {
  const files = await fetchSource(src);
  const { name, buf } = readMember(files.codes.file, src.files.codes.member);
  const codes = {};
  const modifiers = {};
  for (const line of buf.toString("latin1").split(/\r?\n/)) {
    if (line.length < 100) continue;
    const rid = line[10];
    const long = line.slice(11, 91).trimEnd();
    if (rid === "3" || rid === "4") {
      const code = line.slice(0, 5).trim();
      if (!code || code.startsWith("D")) continue;
      if (rid === "3") {
        codes[code] = {
          long: long.trim(),
          short: line.slice(91, 119).trim(),
          pricing: line.slice(119, 121).trim() || null,
          coverage: line.slice(229, 230).trim() || null,
          betos: line.slice(256, 259).trim() || null,
          tos: line.slice(260, 261).trim() || null,
          added: line.slice(268, 276).trim() || null,
          actionEffective: line.slice(276, 284).trim() || null,
          terminated: line.slice(284, 292).trim() || null,
          action: line.slice(292, 293).trim() || null,
        };
      } else if (codes[code]) codes[code].long = `${codes[code].long} ${long.trim()}`.trim();
    } else if (rid === "7" || rid === "8") {
      const mod = line.slice(3, 5).trim();
      if (!mod) continue;
      if (rid === "7") modifiers[mod] = { long: long.trim(), short: line.slice(91, 119).trim(), terminated: line.slice(284, 292).trim() || null };
      else if (modifiers[mod]) modifiers[mod].long = `${modifiers[mod].long} ${long.trim()}`.trim();
    }
  }
  if (Object.keys(codes).length < 5000) throw new Error(`${src.id}: only ${Object.keys(codes).length} codes parsed`);
  return { ...meta(src, files, { codes: name }), stats: { codes: Object.keys(codes).length, modifiers: Object.keys(modifiers).length }, codes, modifiers };
}

const isLevelII = (code) => /^[A-CEGHJ-MP-V]\d{4}$/.test(code);

function parseRvu(text) {
  const rows = parseCsv(text);
  const hi = rows.findIndex((r) => r[0]?.trim() === "HCPCS");
  const width = rows[hi].length;
  const header = Array.from({ length: width }, (_, i) => rows.slice(Math.max(0, hi - 4), hi + 1).map((r) => r[i]?.trim() ?? "").filter(Boolean).join(" ").replace(/\s+/g, " ").toUpperCase());
  const col = (name) => header.findIndex((h) => h === name);
  const idx = {
    code: col("HCPCS"), mod: col("MOD"), desc: col("DESCRIPTION"), status: col("STATUS CODE"), notMedicare: col("NOT USED FOR MEDICARE PAYMENT"),
    work: col("WORK RVU"), peNf: col("NON-FAC PE RVU"), peNfNa: col("NON-FAC NA INDICATOR"), peF: col("FACILITY PE RVU"), peFNa: col("FACILITY NA INDICATOR"),
    mp: col("MP RVU"), pctc: col("PCTC IND"), glob: col("GLOB DAYS"), mult: col("MULT PROC"), bilat: col("BILAT SURG"), asst: col("ASST SURG"), co: col("CO- SURG"), team: col("TEAM SURG"), cf: col("CONV FACTOR"),
  };
  for (const [k, v] of Object.entries(idx)) if (v < 0) throw new Error(`RVU column ${k} not found in header: ${header.join("|")}`);
  const out = {};
  let cf = null;
  const num = (v) => (v === undefined || v.trim() === "" ? 0 : Number(v));
  for (const r of rows.slice(hi + 1)) {
    const code = r[idx.code]?.trim();
    if (!code || !/^[0-9A-Z]{4}[0-9A-Z]$/.test(code)) continue;
    const mod = r[idx.mod]?.trim() ?? "";
    const rec = {
      s: r[idx.status]?.trim(),
      w: num(r[idx.work]), pn: num(r[idx.peNf]), pf: num(r[idx.peF]), mp: num(r[idx.mp]),
      nfNa: idx.peNfNa >= 0 && r[idx.peNfNa]?.trim() === "NA" ? 1 : 0,
      fNa: idx.peFNa >= 0 && r[idx.peFNa]?.trim() === "NA" ? 1 : 0,
      pctc: r[idx.pctc]?.trim(), g: r[idx.glob]?.trim(), mu: r[idx.mult]?.trim(), bi: r[idx.bilat]?.trim(), as: r[idx.asst]?.trim(), co: r[idx.co]?.trim(), tm: r[idx.team]?.trim(),
    };
    if (idx.notMedicare >= 0 && r[idx.notMedicare]?.trim()) rec.nm = 1;
    if (isLevelII(code)) rec.d = r[idx.desc]?.trim();
    out[mod ? `${code}-${mod}` : code] = rec;
    if (!cf && Number(r[idx.cf])) cf = Number(r[idx.cf]);
  }
  return { rvu: out, cf };
}

function parseGpci(text) {
  const rows = parseCsv(text);
  const hi = rows.findIndex((r) => r.some((c) => /Medicare Administrative Contractor/i.test(c)) || r[0]?.trim().toUpperCase() === "MEDICARE ADMINISTRATIVE CONTRACTOR (MAC)");
  const header = rows[hi].map((h) => h.replace(/\s+/g, " ").trim().toUpperCase());
  const find = (re) => header.findIndex((h) => re.test(h));
  const ix = { mac: find(/CONTRACTOR/), state: find(/^STATE$/), loc: find(/LOCALITY NUMBER/), name: find(/LOCALITY NAME/), pw: find(/PW GPCI.*(FLOOR|WITH)/) >= 0 ? find(/PW GPCI.*(FLOOR|WITH)/) : find(/PW GPCI/), pe: find(/PE GPCI/), mp: find(/MP GPCI/) };
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const mac = r[ix.mac]?.trim();
    if (!mac || !/^\d{5}$/.test(mac)) continue;
    out.push({ mac, state: r[ix.state]?.trim(), locality: r[ix.loc]?.trim().padStart(2, "0"), name: r[ix.name]?.replace(/\*/g, "").trim(), pw: Number(r[ix.pw]), pe: Number(r[ix.pe]), mp: Number(r[ix.mp]) });
  }
  if (out.length < 100) throw new Error(`GPCI parse found only ${out.length} localities`);
  return out;
}

async function buildPfs(src) {
  const files = await fetchSource(src);
  const a = readMember(files.rvu.file, src.files.rvu.member);
  const b = readMember(files.rvuQp.file, src.files.rvuQp.member);
  const g = readMember(files.gpci.file, src.files.gpci.member);
  const nonQp = parseRvu(a.buf.toString("latin1"));
  const qp = parseRvu(b.buf.toString("latin1"));
  const gpci = parseGpci(g.buf.toString("latin1"));
  if (!nonQp.rvu["99214"] || !nonQp.cf) throw new Error("RVU parse missing 99214 or conversion factor");
  return { ...meta(src, files, { rvu: a.name, rvuQp: b.name, gpci: g.name }), conversionFactor: { nonQualifyingApm: nonQp.cf, qualifyingApm: qp.cf }, stats: { rows: Object.keys(nonQp.rvu).length, localities: gpci.length }, rvu: nonQp.rvu, gpci };
}

async function buildAsp(src) {
  const files = await fetchSource(src);
  const lim = readMember(files.limits.file, src.files.limits.member);
  const np = readMember(files.notPayable.file, src.files.notPayable.member);
  const rows = parseCsv(lim.buf.toString("latin1"));
  const hi = rows.findIndex((r) => r[0]?.trim() === "HCPCS Code");
  const limits = {};
  for (const r of rows.slice(hi + 1)) {
    const code = r[0]?.trim();
    if (!/^[0-9A-Z]{5}$/.test(code ?? "")) continue;
    limits[code] = { dosage: r[2]?.trim() || null, limit: Number(r[3]), coinsurance: Number(r[4]), vaccine: !!r[5]?.trim(), ...(isLevelII(code) ? { d: r[1]?.trim() } : {}), ...(r[10]?.trim() ? { note: r[10].trim() } : {}) };
  }
  const npRows = parseCsv(np.buf.toString("latin1"));
  const nhi = npRows.findIndex((r) => /HCPCS/i.test(r[0] ?? ""));
  const notPayable = {};
  for (const r of npRows.slice(nhi + 1)) {
    const code = r[0]?.trim();
    if (/^[0-9A-Z]{5}$/.test(code ?? "")) notPayable[code] = r.slice(2).map((x) => x.trim()).filter(Boolean).join(" ") || "Not payable under Part B";
  }
  if (!limits.J1885 || !limits["90677"]) throw new Error("ASP parse missing expected codes");
  return { ...meta(src, files, { limits: lim.name, notPayable: np.name }), stats: { limits: Object.keys(limits).length, notPayable: Object.keys(notPayable).length }, limits, notPayable };
}

async function buildClfs(src) {
  const files = await fetchSource(src);
  const { name, buf } = readMember(files.rates.file, src.files.rates.member);
  const rows = parseCsv(buf.toString("latin1"));
  const hi = rows.findIndex((r) => r[0]?.trim() === "YEAR");
  const h = Object.fromEntries(rows[hi].map((x, i) => [x.trim(), i]));
  const rates = {};
  for (const r of rows.slice(hi + 1)) {
    const code = r[h.HCPCS]?.trim();
    if (!/^[0-9A-Z]{5}$/.test(code ?? "")) continue;
    const mod = r[h.MOD]?.trim();
    rates[mod ? `${code}-${mod}` : code] = { rate: Number(r[h.RATE]), indicator: r[h.INDICATOR]?.trim(), eff: r[h.EFF_DATE]?.trim(), ...(isLevelII(code) ? { d: r[h.SHORTDESC]?.trim() } : {}) };
  }
  if (!rates["83036"] || !rates["87880"]) throw new Error("CLFS parse missing expected codes");
  return { ...meta(src, files, { rates: name }), stats: { rates: Object.keys(rates).length }, rates };
}

async function buildVaxAdmin(src) {
  const files = await fetchSource(src);
  const { name, buf } = readMember(files.rates.file, src.files.rates.member);
  const rows = parseCsv(buf.toString("latin1"));
  const hi = rows.findIndex((r) => /Contractor/i.test(r[0] ?? ""));
  const codes = rows[hi].slice(5).map((h) => h.trim()).filter(Boolean);
  const money = (v) => Number(String(v ?? "").replace(/[$,\s]/g, ""));
  const national = {};
  const localities = {};
  for (const r of rows.slice(hi + 1)) {
    const mac = r[0]?.trim();
    const vals = Object.fromEntries(codes.map((c, i) => [c, money(r[5 + i])]).filter(([, v]) => Number.isFinite(v) && v > 0));
    if (!Object.keys(vals).length) continue;
    if (!mac) Object.assign(national, vals);
    else if (/^\d{5}$/.test(mac)) localities[`${mac}:${r[2].trim().padStart(2, "0")}`] = vals;
  }
  if (!national.G0008 || Object.keys(localities).length < 100) throw new Error("Vaccine administration rate parse failed");
  return { ...meta(src, files, { rates: name }), stats: { localities: Object.keys(localities).length }, national, localities };
}

async function buildHcc(src) {
  const files = await fetchSource(src);
  const tmp = mkdtempSync(path.join(tmpdir(), "hcc-"));
  try {
    const inner = readMember(files.package.file, src.files.package.member);
    const innerZip = path.join(tmp, "v28.zip");
    writeFileSync(innerZip, inner.buf);
    const read = (n) => readMember(innerZip, null, { pattern: new RegExp(`${n}$`) }).buf.toString("utf8").replace(/^﻿/, "");
    const map = parseCsv(read("ICD10_CC_mappings_CMS_HCC_2026_v28.csv")).slice(1).filter((r) => r[0]);
    const hier = parseCsv(read("V28_HCC_Hierarchies.csv")).slice(1).filter((r) => r[0]);
    const cats = parseCsv(read("V28_Diagnosis_Categories.csv")).slice(1).filter((r) => r[0]);
    const inter = parseCsv(read("V28_Interactions.csv")).slice(1).filter((r) => r[0]);
    const ce = parseCsv(read("V28_CE_Relative_Factors.csv"));
    const ceHeader = ce[0].map((h) => h.replace(/^﻿/, "").trim());
    const factors = {};
    const labels = {};
    for (const r of ce.slice(1).filter((x) => x[0])) {
      const v = r[0].trim();
      labels[v] = r[1]?.trim();
      factors[v] = Object.fromEntries(ceHeader.slice(2).map((h, i) => [h, r[i + 2]?.trim() ? Number(r[i + 2]) : null]));
    }
    const mapping = {};
    for (const r of map) {
      const row = [`HCC${Number(r[1])}`];
      const mce = r[2]?.trim() || null;
      const age = r[3]?.trim() || null;
      const sex = r[4]?.trim() ? String(Number(r[4])) : null;
      if (mce || age || sex) row.push(mce, age, sex);
      (mapping[r[0].trim()] ??= []).push(row);
    }
    const hierarchies = Object.fromEntries(hier.map((r) => [r[0].trim(), r.slice(1).map((x) => x.trim()).filter(Boolean)]));
    const categories = Object.fromEntries(cats.map((r) => [r[0].trim(), r.slice(1).map((x) => x.trim()).filter(Boolean)]));
    const interactions = Object.fromEntries(inter.map((r) => [r[0].trim(), r.slice(1).map((x) => x.trim()).filter(Boolean)]));
    if (Object.keys(mapping).length < 7000 || !mapping.E1165) throw new Error("HCC mapping parse failed");
    return { ...meta(src, files, { package: inner.name }), stats: { mappedCodes: Object.keys(mapping).length, hccs: Object.keys(hierarchies).length, variables: Object.keys(factors).length }, segments: ceHeader.slice(2), mapping, hierarchies, categories, interactions, factors, labels };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function meta(src, files, members) {
  return {
    id: src.id,
    kind: src.kind,
    name: src.name,
    publisher: src.publisher,
    version: src.version,
    effective: src.effective,
    license: src.license,
    builtAt: new Date().toISOString(),
    sources: Object.entries(files).map(([k, f]) => ({ key: k, url: f.url, sha256: f.sha256, bytes: f.bytes, member: members[k] ?? f.member })),
  };
}

function writeArtifact(dir, obj) {
  mkdirSync(dir, { recursive: true });
  const json = Buffer.from(JSON.stringify(obj));
  const gz = gzipSync(json, { level: 9 });
  const file = path.join(dir, `${obj.id}.json.gz`);
  writeFileSync(file, gz);
  return { file: path.relative(ROOT, file), sha256: sha256(gz), bytes: gz.length };
}

async function buildPublic() {
  const builders = { icd10cm: buildIcd, hcpcs: buildHcpcs, pfs: buildPfs, hcc: buildHcc, asp: buildAsp, clfs: buildClfs, vaxadmin: buildVaxAdmin };
  for (const src of SOURCES.public) {
    if (only && !only.includes(src.id)) continue;
    log("building", src.id);
    const art = await builders[src.kind](src);
    const written = writeArtifact(DIST, art);
    lock.sources[src.id] = { name: src.name, version: src.version, effective: src.effective, files: Object.fromEntries(art.sources.map((s) => [s.key, { url: s.url, sha256: s.sha256, bytes: s.bytes, member: s.member }])), artifact: written, stats: art.stats, builtAt: art.builtAt };
    log("wrote", written.file, `${(written.bytes / 1e6).toFixed(2)} MB`, JSON.stringify(art.stats));
  }
  lock.generated = new Date().toISOString();
  writeFileSync(LOCK, JSON.stringify(lock, null, 2) + "\n");
}

async function buildLicensed() {
  if (!args.has("--accept-cms-ama-license")) {
    console.error([
      "The licensed code sets (NCCI PTP, NCCI MUE, Medicare Coverage Database articles) contain CPT content owned by the",
      "American Medical Association (and CDT/UB-04 content in the coverage database). CMS distributes them under the",
      "point-and-click license at https://www.cms.gov/license/ama and the MCD terms at",
      "https://www.cms.gov/medicare-coverage-database/downloads/downloads.aspx, for internal use within your organization.",
      "Chartside never redistributes these files. Review the terms, then rerun with --accept-cms-ama-license.",
    ].join("\n"));
    process.exit(2);
  }
  mkdirSync(LICENSED, { recursive: true });
  const dbFile = path.join(LICENSED, "licensed.db");
  if (existsSync(dbFile)) rmSync(dbFile);
  const db = new DatabaseSync(dbFile);
  db.exec(readFileSync(path.join(ROOT, "codesets/licensed-schema.sql"), "utf8"));
  const record = { acceptedAt: new Date().toISOString(), acceptedBy: process.env.USER ?? "operator", terms: ["https://www.cms.gov/license/ama", "https://www.cms.gov/medicare-coverage-database/downloads/downloads.aspx"], sources: {} };
  for (const src of SOURCES.licensed) {
    if (only && !only.includes(src.id)) continue;
    const files = await fetchSource(src);
    record.sources[src.id] = { name: src.name, version: src.version, effective: src.effective, files: Object.fromEntries(Object.entries(files).map(([k, f]) => [k, { url: f.url, sha256: f.sha256, bytes: f.bytes }])) };
    if (src.kind === "ncci-ptp") {
      const ins = db.prepare("INSERT INTO ptp (col1, col2, eff, del, modifier, rationale) VALUES (?, ?, ?, ?, ?, ?)");
      db.exec("BEGIN");
      let n = 0;
      for (const f of Object.values(files)) {
        const { buf } = readMember(f.file, null, { pattern: /\.txt$/i });
        for (const line of buf.toString("latin1").split(/\r?\n/)) {
          const c = line.split("\t");
          if (c.length < 6 || !/^[0-9A-Z]{5}$/.test(c[0]?.trim())) continue;
          ins.run(c[0].trim(), c[1].trim(), c[3].trim(), c[4].trim() === "*" ? null : c[4].trim(), Number(c[5].trim()), c[6]?.trim() ?? null);
          n++;
        }
      }
      db.exec("COMMIT");
      record.sources[src.id].rows = n;
      log("ptp rows", n);
    } else if (src.kind === "ncci-mue") {
      const { buf } = readMember(files.mue.file, null, { pattern: /\.csv$/i });
      const rows = parseCsv(buf.toString("latin1"));
      const ins = db.prepare("INSERT OR REPLACE INTO mue (code, value, mai, rationale) VALUES (?, ?, ?, ?)");
      db.exec("BEGIN");
      let n = 0;
      for (const r of rows) {
        if (!/^[0-9A-Z]{5}$/.test(r[0]?.trim() ?? "") || !/^\d+$/.test(r[1]?.trim() ?? "")) continue;
        ins.run(r[0].trim(), Number(r[1]), Number(r[2].trim()[0]), r[3]?.trim() ?? null);
        n++;
      }
      db.exec("COMMIT");
      record.sources[src.id].rows = n;
      log("mue rows", n);
    } else if (src.kind === "mcd") {
      const zip = files.articles.file;
      const inner = readMember(zip, null, { pattern: /current_article_csv\.zip$/ });
      const tmp = mkdtempSync(path.join(tmpdir(), "mcd-"));
      const csvZip = path.join(tmp, "a.zip");
      writeFileSync(csvZip, inner.buf);
      const csv = (n) => parseCsv(readMember(csvZip, n).buf.toString("utf8"));
      const index = (rows) => Object.fromEntries(rows[0].map((h, i) => [h.trim(), i]));
      const contractors = csv("contractor.csv");
      const ci = index(contractors);
      const byId = new Map(contractors.slice(1).map((r) => [`${r[ci.contractor_id]}:${r[ci.contractor_version]}`, { number: r[ci.contractor_number], name: r[ci.contractor_bus_name] }]));
      const articles = csv("article.csv");
      const ai = index(articles);
      db.exec("BEGIN");
      const insA = db.prepare("INSERT OR REPLACE INTO article (id, version, display_id, title, eff, end_date) VALUES (?, ?, ?, ?, ?, ?)");
      for (const r of articles.slice(1)) if (r[ai.article_id]) insA.run(r[ai.article_id], r[ai.article_version], r[ai.display_id], r[ai.title], r[ai.article_eff_date]?.slice(0, 10), r[ai.article_end_date]?.slice(0, 10) || null);
      const ac = csv("article_x_contractor.csv");
      const aci = index(ac);
      const insC = db.prepare("INSERT INTO article_contractor (article_id, contractor_number, contractor_name) VALUES (?, ?, ?)");
      for (const r of ac.slice(1)) {
        const c = byId.get(`${r[aci.contractor_id]}:${r[aci.contractor_version]}`);
        if (c) insC.run(r[aci.article_id], c.number, c.name);
      }
      const ah = csv("article_x_hcpc_code.csv");
      const ahi = index(ah);
      const insH = db.prepare("INSERT INTO article_hcpc (article_id, code, grp) VALUES (?, ?, ?)");
      for (const r of ah.slice(1)) if (r[ahi.article_id]) insH.run(r[ahi.article_id], r[ahi.hcpc_code_id], r[ahi.hcpc_code_group]);
      const icd = csv("article_x_icd10_covered.csv");
      const ii = index(icd);
      const insI = db.prepare("INSERT INTO article_icd (article_id, code, grp) VALUES (?, ?, ?)");
      for (const r of icd.slice(1)) if (r[ii.article_id]) insI.run(r[ii.article_id], r[ii.icd10_code_id].replace(/\./g, ""), r[ii.icd10_covered_group]);
      db.exec("COMMIT");
      rmSync(tmp, { recursive: true, force: true });
      record.sources[src.id].rows = { articles: articles.length - 1, hcpc: ah.length - 1, icd: icd.length - 1 };
      log("mcd", JSON.stringify(record.sources[src.id].rows));
    }
  }
  db.prepare("INSERT OR REPLACE INTO meta (id, content) VALUES ('manifest', ?)").run(JSON.stringify(record));
  db.close();
  writeFileSync(path.join(LICENSED, "manifest.json"), JSON.stringify(record, null, 2));
  log("licensed code sets written to", path.relative(ROOT, LICENSED));
}

if (args.has("--licensed")) await buildLicensed();
else await buildPublic();
