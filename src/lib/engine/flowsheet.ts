export interface FlowRow {
  key: string;
  group: "Vitals" | "Pain" | "Intake/Output" | "Neuro" | "Respiratory" | "Skin" | "Lines/Drains" | "Safety" | "Mobility" | "Nutrition" | "Education" | "Glucose";
  row: string;
  value: string;
  abnormal: boolean;
  evidence: string;
}

export interface CareItem {
  key: string;
  text: string;
  due: string | null;
  evidence: string;
}

interface Rule {
  group: FlowRow["group"];
  row: string;
  re: RegExp;
  value: (m: RegExpExecArray) => string;
  abnormal?: (m: RegExpExecArray) => boolean;
}

const RULES: Rule[] = [
  { group: "Vitals", row: "Blood pressure", re: /\b(?:blood pressure|BP)\b[^\d]{0,20}(\d{2,3})\s*(?:over|\/)\s*(\d{2,3})/i, value: (m) => `${m[1]}/${m[2]} mmHg`, abnormal: (m) => +m[1] >= 160 || +m[1] < 90 || +m[2] >= 100 },
  { group: "Vitals", row: "Heart rate", re: /\b(?:heart rate|pulse|HR)\b[^\d]{0,15}(\d{2,3})/i, value: (m) => `${m[1]} bpm`, abnormal: (m) => +m[1] > 110 || +m[1] < 50 },
  { group: "Vitals", row: "Respiratory rate", re: /\b(?:resp(?:iratory)? rate|resps|RR)\b[^\d]{0,15}(\d{1,2})/i, value: (m) => `${m[1]} /min`, abnormal: (m) => +m[1] > 24 || +m[1] < 10 },
  { group: "Vitals", row: "Temperature", re: /\b(?:temp(?:erature)?)\b[^\d]{0,15}(\d{2,3}(?:\.\d)?)/i, value: (m) => `${m[1]} ${+m[1] > 50 ? "°F" : "°C"}`, abnormal: (m) => (+m[1] > 50 ? +m[1] >= 100.4 : +m[1] >= 38) },
  { group: "Vitals", row: "SpO2", re: /\b(?:sat(?:uration)?s?|SpO2|O2 sat|oxygen saturation|pulse ox)\b[^\d]{0,15}(\d{2,3})\s*(?:%|percent)?/i, value: (m) => `${m[1]}%`, abnormal: (m) => +m[1] < 92 },
  { group: "Vitals", row: "Weight", re: /\b(?:weight|weighs|weighed)\b[^\d]{0,15}(\d{2,3}(?:\.\d)?)\s*(kg|kilograms?|lbs?|pounds)/i, value: (m) => `${m[1]} ${/k/i.test(m[2]) ? "kg" : "lb"}` },
  { group: "Respiratory", row: "O2 device", re: /\b(room air|(\d(?:\.\d)?)\s*(?:liters?|L)\s*(?:per minute\s*)?(?:via\s*|by\s*|on\s*)?(nasal cannula|NC|face mask|non-?rebreather|high flow))\b/i, value: (m) => (/room air/i.test(m[1]) ? "Room air" : `${m[2]} L/min ${/NC|nasal/i.test(m[3]) ? "nasal cannula" : m[3].toLowerCase()}`), abnormal: (m) => !/room air/i.test(m[1]) },
  { group: "Respiratory", row: "Lung sounds", re: /\blungs?\b[^.;]{0,40}?\b(clear|diminished[^.;,]*|crackles[^.;,]*|wheez\w*[^.;,]*|rhonchi[^.;,]*)/i, value: (m) => m[1].trim(), abnormal: (m) => !/^clear/i.test(m[1]) },
  { group: "Pain", row: "Pain score", re: /\bpain\b[^.;]{0,25}?\b(\d{1,2})\s*(?:out of|\/)\s*10\b|\b(\d{1,2})\s*(?:out of|\/)\s*10\b[^.;]{0,20}\bpain\b/i, value: (m) => `${m[1] ?? m[2]}/10`, abnormal: (m) => +(m[1] ?? m[2]) >= 7 },
  { group: "Pain", row: "Pain location", re: /\bpain\b[^.;]{0,25}?\b(?:in|at) (?!(?:an?|one|two|three|\d+) (?:hour|minute)s?\b)(?:the |his |her |their )?([a-z ]{3,30}?)(?:[,.;]| and| rated|$)/i, value: (m) => m[1].trim() },
  { group: "Neuro", row: "Orientation", re: /\b(?:alert and oriented|A&O|A and O|oriented)\s*(?:x|times)\s*(\d|one|two|three|four)/i, value: (m) => `A&O x${({ one: "1", two: "2", three: "3", four: "4" } as Record<string, string>)[m[1].toLowerCase()] ?? m[1]}`, abnormal: (m) => !/4|four/i.test(m[1]) },
  { group: "Neuro", row: "GCS", re: /\b(?:GCS|glasgow(?: coma scale)?)\b[^\d]{0,10}(\d{1,2})/i, value: (m) => m[1], abnormal: (m) => +m[1] < 15 },
  { group: "Neuro", row: "Level of consciousness", re: /\b(confused|lethargic|drowsy|agitated|restless|disoriented)\b/i, value: (m) => m[1].toLowerCase(), abnormal: () => true },
  { group: "Intake/Output", row: "Oral intake", re: /\b(?:drank|intake(?: of)?|took in|PO intake)\b[^\d]{0,15}(\d{2,4})\s*(?:mL|milliliters|cc)/i, value: (m) => `${m[1]} mL` },
  { group: "Intake/Output", row: "Meal intake", re: /\bate (?:about )?(\d{1,3})\s*(?:%|percent) of (?:his |her |their )?(breakfast|lunch|dinner|meal|tray)/i, value: (m) => `${m[1]}% of ${m[2]}`, abnormal: (m) => +m[1] < 50 },
  { group: "Intake/Output", row: "Urine output", re: /\b(?:urine output|voided|UOP|foley (?:drained|output))\b[^\d]{0,15}(\d{2,4})\s*(?:mL|milliliters|cc)/i, value: (m) => `${m[1]} mL`, abnormal: (m) => +m[1] < 100 },
  { group: "Intake/Output", row: "Bowel movement", re: /\b(?:bowel movement|BM|stool)\b[^.;]{0,20}?\b(today|this morning|x\s*\d|none|last \w+)/i, value: (m) => m[1] },
  { group: "Glucose", row: "Point-of-care glucose", re: /\b(?:fingerstick|finger stick|blood sugar|glucose|accu-?chek|POC glucose)\b[^\d]{0,15}(\d{2,3})\b/i, value: (m) => `${m[1]} mg/dL`, abnormal: (m) => +m[1] > 250 || +m[1] < 70 },
  { group: "Skin", row: "Skin integrity", re: /\bskin\b[^.;]{0,15}?\b(intact|warm and dry|clean,? dry,? (?:and )?intact|breakdown[^.;,]*)/i, value: (m) => m[1], abnormal: (m) => /breakdown/i.test(m[1]) },
  { group: "Skin", row: "Pressure injury", re: /\bstage (1|2|3|4|one|two|three|four|I{1,3}|IV)\b[^.;]{0,15}?(?:pressure (?:injury|ulcer|wound))?[^.;]{0,15}?\b(?:on|at|over) (?:the |his |her )?([a-z ]{3,20}?)(?:[,.;]|$| and)/i, value: (m) => `Stage ${m[1]} at ${m[2].trim()}`, abnormal: () => true },
  { group: "Skin", row: "Braden score", re: /\bbraden\b[^\d]{0,15}(\d{1,2})/i, value: (m) => m[1], abnormal: (m) => +m[1] <= 18 },
  { group: "Lines/Drains", row: "Peripheral IV", re: /\b(\d{2})\s*(?:gauge|g)\b[^.;]{0,40}?\b(?:IV|peripheral)?[^.;]{0,20}?\b(?:in|on) (?:the |his |her )?((?:left|right) [a-z]+)/i, value: (m) => `${m[1]}g ${m[2]}` },
  { group: "Lines/Drains", row: "IV site", re: /\b(?:IV )?site (?:is )?(clean,? dry,? (?:and )?intact|red[^.;,]*|swollen[^.;,]*|infiltrated[^.;,]*|leaking[^.;,]*)/i, value: (m) => m[1], abnormal: (m) => !/clean/i.test(m[1]) },
  { group: "Lines/Drains", row: "Foley catheter", re: /\bfoley\b[^.;]{0,30}?\b(in place|removed|draining[^.;,]*)/i, value: (m) => m[1] },
  { group: "Safety", row: "Fall risk (Morse)", re: /\bmorse\b[^\d]{0,15}(\d{1,3})/i, value: (m) => m[1], abnormal: (m) => +m[1] >= 45 },
  { group: "Safety", row: "Fall precautions", re: /\b(bed alarm (?:on|in place)|fall precautions (?:in place|maintained)|call light (?:with|within) reach)\b/i, value: (m) => m[1] },
  { group: "Mobility", row: "Activity", re: /\b(ambulated|walked)\b[^.;]{0,15}?(\d{2,4})\s*(?:feet|ft)(?:[^.;]{0,20}?\bwith (?:a |the )?(walker|cane|assist(?:ance)?|standby assist|PT))?/i, value: (m) => `Ambulated ${m[2]} ft${m[3] ? ` with ${m[3]}` : ""}` },
  { group: "Mobility", row: "Repositioning", re: /\b(turned|repositioned)\b[^.;]{0,20}?\b(left|right|side|every two hours|q2h)/i, value: (m) => `Repositioned (${m[2]})` },
  { group: "Nutrition", row: "Diet", re: /\b(\d(?:\.\d)?\s*(?:gram|g) (?:sodium|salt)|cardiac|diabetic|clear liquid|full liquid|regular|renal|NPO)\s*diet\b|\b(NPO)\b/i, value: (m) => (m[1] ?? m[2]).trim() },
  { group: "Education", row: "Education provided", re: /\b(?:educated|taught|teaching|reviewed|instructed)\b[^.;]{0,15}?\b(?:on|about|regarding)\s+([^.;]{4,80})/i, value: (m) => m[1].replace(/,? (?:and )?(?:he|she|they|patient) verbalized understanding.*$/i, "").trim() },
  { group: "Education", row: "Understanding", re: /\b(verbalized understanding|teach-?back (?:completed|successful)|needs reinforcement)\b/i, value: (m) => m[1], abnormal: (m) => /reinforce/i.test(m[1]) },
];

export function extractFlowsheet(text: string): FlowRow[] {
  const out: FlowRow[] = [];
  const sentences = text.split(/(?<=[.;!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  for (const s of sentences) {
    for (const r of RULES) {
      const m = r.re.exec(s);
      if (!m) continue;
      if (/\b(?:call|notify|page)\b[^.]*\bif\b/i.test(s) && r.group === "Vitals") continue;
      const key = `${r.group}:${r.row}`;
      const row: FlowRow = { key, group: r.group, row: r.row, value: r.value(m), abnormal: r.abnormal?.(m) ?? false, evidence: s };
      const i = out.findIndex((x) => x.key === key);
      if (i >= 0) out[i] = row;
      else out.push(row);
    }
  }
  return out;
}

const TODO = /\b(?:need(?:s)? to|needs|will need|due for|plan to|going to|remember to|reassess|recheck|follow up on|pending|awaiting|call (?:the )?(?:doctor|MD|provider|hospitalist) if|notify (?:the )?(?:MD|provider|hospitalist) if)\b[^.;]*/gi;
const DONE = /\b(changed|completed|done|given|administered|removed|drawn|collected|discontinued|finished|resulted|came back)\b/i;
const TIME = /\b(?:at|by|before)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{4}|noon|midnight)\b|\bin (?:an? |one |two |\d+ )?(hour|hours|minutes)\b/i;

const FILLER = new Set(["recheck", "check", "reassess", "draw", "change", "remove", "removed", "give", "obtain", "needs", "before", "after", "noon", "midnight", "hour", "hours", "minute", "minutes", "today", "tonight", "morning", "evening", "discharge", "dinner", "lunch", "breakfast", "every", "again"]);

function norm(s: string) {
  return s.toLowerCase().replace(/\b(?:needs?|to|will|the|a|an|his|her|their|due for|plan to|going to|remember to)\b/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export function updateCareList(current: CareItem[], text: string): { items: CareItem[]; added: CareItem[]; closed: CareItem[] } {
  const sentences = text.split(/(?<=[.;!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const closed: CareItem[] = [];
  let items = [...current];
  for (const s of sentences) {
    if (!DONE.test(s) || TODO.test(s)) {
      TODO.lastIndex = 0;
      continue;
    }
    TODO.lastIndex = 0;
    const words = new Set(norm(s).split(" ").filter((w) => w.length > 3 && !["changed", "completed", "given", "administered", "removed", "drawn", "collected", "done", "finished"].includes(w)));
    for (const it of items) {
      const iw = norm(it.text).split(" ").filter((w) => w.length > 3 && !FILLER.has(w) && !/^\d+$/.test(w));
      const hit = iw.filter((w) => words.has(w) || [...words].some((x) => x.startsWith(w.slice(0, 5)) && w.length > 4)).length;
      if (iw.length && hit / iw.length >= 0.5) closed.push(it);
    }
    items = items.filter((it) => !closed.includes(it));
  }
  const added: CareItem[] = [];
  for (const s of sentences) {
    for (const m of s.matchAll(TODO)) {
      const t = m[0].trim().replace(/[,]+$/, "");
      if (t.split(/\s+/).length < 3) continue;
      const text2 = t.charAt(0).toUpperCase() + t.slice(1);
      const key = norm(text2).slice(0, 60);
      if (items.some((x) => x.key === key) || added.some((x) => x.key === key)) continue;
      const tm = TIME.exec(s);
      added.push({ key, text: text2, due: tm ? (tm[1] ?? `in ${tm[2]}`) : null, evidence: s });
    }
  }
  return { items: [...items, ...added], added, closed };
}

export function shiftSummary(rows: { group: string; row: string; value: string; abnormal: boolean; recordedAt: string }[], care: CareItem[]) {
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of [...rows].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) latest.set(`${r.group}:${r.row}`, r);
  const abnormal = [...latest.values()].filter((r) => r.abnormal).map((r) => `${r.row} ${r.value}`);
  const vit = ["Blood pressure", "Heart rate", "SpO2", "Temperature"].map((k) => [...latest.values()].find((r) => r.row === k)).filter(Boolean).map((r) => `${r!.row === "Blood pressure" ? "BP" : r!.row === "Heart rate" ? "HR" : r!.row} ${r!.value}`);
  const lines: string[] = [];
  if (vit.length) lines.push(`Latest vitals: ${vit.join(", ")}.`);
  if (abnormal.length) lines.push(`Needs attention: ${abnormal.join("; ")}.`);
  if (care.length) lines.push(`Pending care: ${care.map((c) => `${c.text}${c.due ? ` (${c.due})` : ""}`).join("; ")}.`);
  if (!lines.length) lines.push("No flowsheet data filed this shift.");
  return lines;
}
