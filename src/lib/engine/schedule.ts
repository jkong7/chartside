export interface ScheduleRow {
  line: number;
  raw: string;
  time: string | null;
  name: string | null;
  dob: string | null;
  mrn: string | null;
  sex: "F" | "M" | "X" | null;
  visitType: "new" | "follow-up" | "acute" | "annual" | "telehealth";
  reason: string;
  problems: string[];
}

const TIME = /\b(\d{1,2}):(\d{2})\s*([ap])\.?m?\.?\b|\b([01]?\d|2[0-3]):([0-5]\d)\b/i;
const DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/;
const MRN = /\b(?:MRN[:#\s]*)?([A-Z]{0,3}\d{5,10})\b/;
const TYPES: [RegExp, ScheduleRow["visitType"]][] = [
  [/\b(?:telehealth|video|virtual|tele)\b/i, "telehealth"],
  [/\b(?:new patient|new pt|new visit|establish(?:ing)? care)\b/i, "new"],
  [/\bNP\b/, "new"],
  [/\b(?:annual|physical|wellness|AWV|preventive|well child)\b/i, "annual"],
  [/\b(?:acute|sick|same[- ]day|urgent|walk[- ]in)\b/i, "acute"],
  [/\b(?:follow[- ]?up|f\/u|FU|recheck|return)\b/i, "follow-up"],
];

function iso(y: number, m: number, d: number) {
  const yy = y < 100 ? (y > 30 ? 1900 + y : 2000 + y) : y;
  return `${yy}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function splitCsv(line: string) {
  const out: string[] = [];
  let cell = "";
  let q = false;
  for (const c of line) {
    if (c === '"') q = !q;
    else if ((c === "," || c === "\t") && !q) {
      out.push(cell.trim());
      cell = "";
    } else cell += c;
  }
  out.push(cell.trim());
  return out;
}

function headerMap(cells: string[]) {
  const m: Record<string, number> = {};
  cells.forEach((c, i) => {
    const h = c.toLowerCase();
    if (/time|appt|slot/.test(h) && m.time === undefined) m.time = i;
    else if (/^(patient|name|patient name)$/.test(h) || (/name/.test(h) && m.name === undefined)) m.name = i;
    else if (/dob|birth/.test(h)) m.dob = i;
    else if (/mrn|record|chart/.test(h)) m.mrn = i;
    else if (/sex|gender/.test(h)) m.sex = i;
    else if (/type/.test(h)) m.type = i;
    else if (/reason|complaint|note|comment|chief/.test(h)) m.reason = i;
    else if (/problem|diagnos/.test(h)) m.problems = i;
  });
  return m.name !== undefined ? m : null;
}

function parseTime(s: string | undefined) {
  if (!s) return null;
  const t = TIME.exec(s);
  if (!t) return null;
  let h = Number(t[1] ?? t[4]);
  const min = Number(t[2] ?? t[5]);
  if (t[3]) {
    const pm = t[3].toLowerCase() === "p";
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function parseDate(s: string | undefined) {
  if (!s) return null;
  const d = DATE.exec(s);
  if (!d) return null;
  return d[4] ? iso(Number(d[4]), Number(d[5]), Number(d[6])) : iso(Number(d[3]), Number(d[1]), Number(d[2]));
}

function typeOf(s: string): ScheduleRow["visitType"] {
  for (const [re, t] of TYPES) if (re.test(s)) return t;
  return "follow-up";
}

function sexOf(s: string | undefined): ScheduleRow["sex"] {
  if (!s) return null;
  if (/^\s*(?:f|female|woman)\s*$/i.test(s)) return "F";
  if (/^\s*(?:m|male|man)\s*$/i.test(s)) return "M";
  return /\S/.test(s) ? "X" : null;
}

export function parseSchedule(text: string): ScheduleRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = /[,\t]/.test(lines[0]) ? headerMap(splitCsv(lines[0])) : null;
  const out: ScheduleRow[] = [];
  const body = header ? lines.slice(1) : lines;
  body.forEach((raw, idx) => {
    const line = idx + (header ? 2 : 1);
    if (header) {
      const c = splitCsv(raw);
      const name = c[header.name]?.replace(/\s+/g, " ").trim() || null;
      if (!name) return;
      const reason = header.reason !== undefined ? c[header.reason] ?? "" : "";
      out.push({ line, raw, time: parseTime(c[header.time ?? -1]), name: normalizeName(name), dob: parseDate(c[header.dob ?? -1]), mrn: header.mrn !== undefined ? c[header.mrn]?.replace(/^MRN[:#\s]*/i, "") || null : null, sex: sexOf(c[header.sex ?? -1]), visitType: typeOf(`${c[header.type ?? -1] ?? ""} ${reason}`), reason, problems: header.problems !== undefined ? (c[header.problems] ?? "").split(/[;|]/).map((x) => x.trim()).filter(Boolean) : [] });
      return;
    }
    let rest = raw;
    const time = parseTime(rest);
    rest = rest.replace(TIME, " ");
    const dob = parseDate(rest);
    rest = rest.replace(DATE, " ");
    const mrnM = MRN.exec(rest);
    const mrn = mrnM ? mrnM[1] : null;
    if (mrnM) rest = rest.replace(mrnM[0], " ");
    const lastFirst = /\b([A-Z][a-zA-Z'-]+),\s*([A-Z][a-zA-Z'-]+)\b/.exec(rest);
    if (lastFirst) {
      rest = rest.replace(lastFirst[0], " ");
      const parts2 = rest.split(/\s{2,}|\s[-|·]\s|,\s*|\t/).map((x) => x.trim()).filter(Boolean);
      const reason2 = parts2.join(", ");
      out.push({ line, raw, time, name: `${lastFirst[2]} ${lastFirst[1]}`, dob, mrn, sex: null, visitType: typeOf(reason2), reason: reason2.replace(/^(?:new patient|follow[- ]?up|f\/u|telehealth|video)[:,\s-]*/i, "").trim(), problems: [] });
      return;
    }
    const parts = rest.split(/\s{2,}|\s[-|·]\s|,\s*|\t/).map((x) => x.trim()).filter(Boolean);
    const nameIdx = parts.findIndex((p) => /^[A-Z][a-zA-Z'.-]+(?:\s+[A-Z][a-zA-Z'.-]+){1,3}$/.test(p) || /^[A-Z][a-zA-Z'-]+,\s*[A-Z]/.test(p));
    let name: string | null = null;
    let reason = "";
    if (nameIdx >= 0) {
      name = parts[nameIdx];
      reason = parts.filter((_, i) => i !== nameIdx).join(", ");
    } else {
      const m = /^([A-Z][a-zA-Z'.-]+(?:\s+[A-Z][a-zA-Z'.-]+){1,2})\s+(.*)$/.exec(parts.join(" "));
      if (m) {
        name = m[1];
        reason = m[2];
      }
    }
    if (!name) return;
    out.push({ line, raw, time, name: normalizeName(name), dob, mrn, sex: null, visitType: typeOf(reason), reason: reason.replace(/^(?:new patient|follow[- ]?up|f\/u|telehealth|video)[:,\s-]*/i, "").trim(), problems: [] });
  });
  return out;
}

function normalizeName(n: string) {
  const m = /^([A-Za-z'.-]+),\s*([A-Za-z'.-]+(?:\s+[A-Za-z'.-]+)?)$/.exec(n.trim());
  return m ? `${m[2]} ${m[1]}` : n.trim();
}
