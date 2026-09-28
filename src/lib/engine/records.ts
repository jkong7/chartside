import { REFERRALS } from "./lexicon";
import { inflateSync } from "node:zlib";
import { CONDITIONS, MEDICATIONS } from "./lexicon";

export interface RecordFinding {
  kind: "problem" | "medication" | "allergy" | "lab" | "vital" | "plan";
  label: string;
  code?: string;
  value?: string;
  date?: string;
  detail?: string;
  source: { line: number; text: string };
}

const DOSE = /(\d+(?:\.\d+)?)\s*(mg|mcg|units?|g|mL|puffs?)\b/i;
const FREQ = /\b(once daily|twice daily|three times daily|four times daily|daily|nightly|at bedtime|every (?:morning|evening|night|\d+ hours)|as needed|weekly|BID|TID|QID|QHS|QD|PRN)\b/i;
const FREQ_MAP: Record<string, string> = { bid: "twice daily", tid: "three times daily", qid: "four times daily", qhs: "at bedtime", qd: "daily", prn: "as needed", nightly: "at bedtime" };
const ICD = /\b([A-TV-Z]\d{2}(?:\.\d{1,4}[A-Z]?)?)\b/;
const DATE = /\b(\d{4}-\d{2}-\d{2})\b|\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;

const LABS: { name: string; re: RegExp; unit: string }[] = [
  { name: "Hemoglobin A1c", re: /\b(?:hemoglobin a1c|hba1c|a1c)\b[^\d\n]{0,20}(\d{1,2}(?:\.\d)?)/i, unit: "%" },
  { name: "LDL", re: /\bLDL(?:-C| cholesterol)?\b[^\d\n]{0,20}(\d{2,3})/i, unit: "mg/dL" },
  { name: "Creatinine", re: /\bcreatinine\b[^\d\n]{0,20}(\d(?:\.\d{1,2})?)/i, unit: "mg/dL" },
  { name: "eGFR", re: /\beGFR\b[^\d\n]{0,20}(\d{1,3})/i, unit: "mL/min/1.73m²" },
  { name: "Potassium", re: /\bpotassium\b[^\d\n]{0,20}(\d(?:\.\d)?)/i, unit: "mmol/L" },
  { name: "TSH", re: /\bTSH\b[^\d\n]{0,20}(\d{1,2}(?:\.\d{1,2})?)/i, unit: "mIU/L" },
  { name: "Hemoglobin", re: /\bhemoglobin\b(?! a1c)[^\d\n]{0,20}(\d{1,2}(?:\.\d)?)/i, unit: "g/dL" },
  { name: "BNP", re: /\bBNP\b[^\d\n]{0,20}(\d{2,5})/i, unit: "pg/mL" },
  { name: "Urine albumin/creatinine ratio", re: /\b(?:UACR|albumin\/creatinine|microalbumin)\b[^\d\n]{0,20}(\d{1,4})/i, unit: "mg/g" },
];

const iso = (m: RegExpExecArray) => (m[1] ? m[1] : `${m[4]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`);

type Section = "problems" | "medications" | "allergies" | "results" | "vitals" | "plan" | null;

function sectionOf(line: string): Section | undefined {
  const h = line.trim().toLowerCase().replace(/[:\-=#*]+$/g, "").trim();
  if (h.length > 40) return undefined;
  if (/^(active )?(problem list|problems|diagnoses|past medical history|assessment)$/.test(h)) return "problems";
  if (/^(current |active |home )?(medications?|med list|meds|prescriptions)$/.test(h)) return "medications";
  if (/^(allergies|drug allergies|allergies and intolerances|adverse reactions)$/.test(h)) return "allergies";
  if (/^(results|labs?|laboratory( results)?|lab results)$/.test(h)) return "results";
  if (/^(vitals?|vital signs)$/.test(h)) return "vitals";
  if (/^(plan|assessment and plan|recommendations|follow[- ]?up)$/.test(h)) return "plan";
  return undefined;
}

export function extractRecords(text: string): RecordFinding[] {
  const out: RecordFinding[] = [];
  let section: Section = null;
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const src = { line: i + 1, text: line.slice(0, 200) };
    const s = sectionOf(line);
    if (s !== undefined) {
      section = s;
      return;
    }
    const dateM = DATE.exec(line);
    const date = dateM ? iso(dateM) : undefined;
    if (section === "allergies" || /^allerg(?:y|ies)\s*:/i.test(line)) {
      const body = line.replace(/^allerg(?:y|ies)\s*:\s*/i, "");
      if (/\b(nkda|no known (?:drug )?allergies)\b/i.test(body)) {
        out.push({ kind: "allergy", label: "No known drug allergies", source: src });
        return;
      }
      for (const part of body.split(/;|,(?![^()]*\))/)) {
        const m = /^\s*([A-Za-z][A-Za-z -]{1,40}?)\s*(?:\(([^)]+)\)|[-:–]\s*(.+))?\s*$/.exec(part);
        if (m) out.push({ kind: "allergy", label: m[1].trim().toLowerCase(), detail: (m[2] ?? m[3])?.trim().toLowerCase(), source: src });
      }
      return;
    }
    const med = MEDICATIONS.find((d) => d.patterns.some((re) => re.test(line)));
    if (med && (section === "medications" || DOSE.test(line))) {
      const d = DOSE.exec(line);
      const f = FREQ.exec(line);
      out.push({ kind: "medication", label: med.name, value: d ? `${d[1]} ${d[2].toLowerCase()}` : undefined, detail: f ? FREQ_MAP[f[1].toLowerCase()] ?? f[1].toLowerCase() : undefined, date, source: src });
      return;
    }
    const lab = LABS.find((l) => l.re.test(line));
    if (lab && (section === "results" || section === null || section === "vitals" || section === "plan")) {
      const m = lab.re.exec(line)!;
      if (!/\b(?:check|order|repeat|recheck|goal|target)\b/i.test(line.slice(0, m.index))) {
        out.push({ kind: "lab", label: lab.name, value: `${m[1]} ${lab.unit}`, date, source: src });
        return;
      }
    }
    const bp = /\b(?:BP|blood pressure)\b[^\d\n]{0,10}(\d{2,3})\s*\/\s*(\d{2,3})/i.exec(line);
    if (bp) out.push({ kind: "vital", label: "BP", value: `${bp[1]}/${bp[2]}`, date, source: src });
    const wt = /\b(?:weight|wt)\b[^\d\n]{0,10}(\d{2,3}(?:\.\d)?)\s*(kg|lb|lbs)/i.exec(line);
    if (wt) out.push({ kind: "vital", label: "Weight", value: `${wt[1]} ${wt[2].toLowerCase().replace("lbs", "lb")}`, date, source: src });
    if (bp || wt) return;
    if (section === "problems" || ICD.test(line)) {
      const cond = CONDITIONS.find((c) => c.patterns.some((re) => re.test(line)));
      const code = ICD.exec(line)?.[1];
      if (cond || (section === "problems" && code)) {
        const label = line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").replace(/\s*\(?[A-TV-Z]\d{2}(?:\.\d{1,4}[A-Z]?)?\)?\s*/, " ").replace(/\s+(?:since|onset|dx)\b.*$/i, "").replace(new RegExp(DATE.source, "g"), " ").replace(/\s+/g, " ").trim();
        out.push({ kind: "problem", label: label.length > 3 && label.length < 90 ? label : cond?.label ?? label, code: code ?? cond?.icd10, date, source: src });
        return;
      }
    }
    if (section === "plan" && line.length > 8) out.push({ kind: "plan", label: line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, ""), source: src });
  });
  return dedupe(out);
}

function dedupe(xs: RecordFinding[]) {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = `${x.kind}:${x.label.toLowerCase()}:${x.value ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const CCDA_SECTIONS: Record<string, Exclude<Section, null>> = { "11450-4": "problems", "10160-0": "medications", "48765-2": "allergies", "30954-2": "results", "8716-3": "vitals", "18776-5": "plan" };

function decodeXml(s: string) {
  return s.replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

export function ccdaToText(xml: string) {
  const out: string[] = [];
  const sectionRe = /<section\b[\s\S]*?<\/section>/gi;
  for (const m of xml.matchAll(sectionRe)) {
    const sec = m[0];
    const code = /<code\b[^>]*\bcode="([\d-]+)"/i.exec(sec)?.[1];
    const kind = code ? CCDA_SECTIONS[code] : undefined;
    if (!kind) continue;
    out.push({ problems: "Problems", medications: "Medications", allergies: "Allergies", results: "Results", vitals: "Vital Signs", plan: "Plan" }[kind]);
    const text = /<text\b[^>]*>([\s\S]*?)<\/text>/i.exec(sec)?.[1] ?? "";
    const rows = [...text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => decodeXml(c[1])).filter(Boolean).join(" "));
    const items = rows.length ? rows.filter((r, i) => !(i === 0 && /^(name|problem|medication|substance|test|result|allergen)\b/i.test(r))) : [...text.matchAll(/<(?:item|paragraph|content)\b[^>]*>([\s\S]*?)<\/(?:item|paragraph|content)>/gi)].map((c) => decodeXml(c[1]));
    for (const it of items) out.push(kind === "allergies" && !/^allerg/i.test(it) ? `Allergy: ${it}` : it);
    out.push("");
  }
  return out.join("\n");
}

function pdfStrings(content: string) {
  const out: string[] = [];
  for (const block of content.split(/\bET\b/)) {
    const parts: string[] = [];
    for (const m of block.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj|\[(?:[^\]]*)\]\s*TJ|<([0-9A-Fa-f]+)>\s*Tj/g)) {
      const t = m[0];
      if (t.endsWith("TJ")) for (const s of t.matchAll(/\((?:\\.|[^\\)])*\)/g)) parts.push(unescapePdf(s[0].slice(1, -1)));
      else if (m[1]) parts.push(Buffer.from(m[1], "hex").toString("latin1"));
      else parts.push(unescapePdf(t.slice(t.indexOf("(") + 1, t.lastIndexOf(")"))));
    }
    if (parts.length) out.push(parts.join(""));
  }
  return out;
}

function unescapePdf(s: string) {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, c: string) => (/^[0-7]+$/.test(c) ? String.fromCharCode(parseInt(c, 8)) : ({ n: "\n", r: "", t: "\t", b: "", f: "", "(": "(", ")": ")", "\\": "\\" } as Record<string, string>)[c]));
}

export function pdfToText(buf: Buffer) {
  const s = buf.toString("latin1");
  const lines: string[] = [];
  const re = /<<([\s\S]*?)>>\s*stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf("endstream", start);
    if (end < 0) break;
    let data = buf.subarray(start, end);
    if (/\/FlateDecode/.test(m[1])) {
      try {
        data = inflateSync(data);
      } catch {
        continue;
      }
    } else if (/\/Filter/.test(m[1])) continue;
    lines.push(...pdfStrings(data.toString("latin1")));
    re.lastIndex = end;
  }
  return lines.join("\n").replace(/[\x95]/g, "•");
}

export function recordsText(name: string, mime: string, buf: Buffer) {
  if (/pdf/i.test(mime) || /\.pdf$/i.test(name) || buf.subarray(0, 5).toString() === "%PDF-") return { format: "pdf" as const, text: pdfToText(buf) };
  const t = buf.toString("utf8");
  if (/<ClinicalDocument\b/.test(t)) return { format: "ccda" as const, text: ccdaToText(t) };
  return { format: "text" as const, text: t };
}

const CONSULT = /\b(?:consult(?:ation)?(?: note| report)?|thank you for (?:the|this|your) (?:kind )?referral|referred by|reason for referral|new patient consult|specialist evaluation)\b/i;

export function consultSpecialties(text: string): string[] {
  const head = text.slice(0, 2500);
  if (!CONSULT.test(head)) return [];
  return REFERRALS.filter((r) => r.pattern.test(head)).map((r) => r.name);
}
