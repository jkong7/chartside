import type { NoteSentence, Pregnancy, Utterance } from "../types";

export interface PrenatalFacts {
  ga: { weeks: number; days: number; source: "edd" | "stated" } | null;
  fundalHeight: { cm: number; evidence: string[] } | null;
  fhr: { bpm: number; evidence: string[] } | null;
  warning: { sign: "bleeding" | "fluid" | "contractions" | "movement"; present: boolean | null; evidence: string[] }[];
  preeclampsia: { symptom: string; evidence: string[] }[];
  urineProtein: { value: string; evidence: string[] } | null;
  bp: { sys: number; dia: number; evidence: string[] } | null;
}

export function clinicTimeZone() {
  return typeof window === "undefined" ? process.env.CHARTSIDE_TZ || "America/Chicago" : undefined;
}

export function localDay(at: Date, timeZone = clinicTimeZone()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function gaFrom(edd: string, at: Date, timeZone = clinicTimeZone()) {
  const day = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const daysPregnant = 280 - Math.round((day(edd.slice(0, 10)) - day(localDay(at, timeZone))) / 86400000);
  return { weeks: Math.floor(daysPregnant / 7), days: ((daysPregnant % 7) + 7) % 7 };
}

const SIGNS: { sign: PrenatalFacts["warning"][number]["sign"]; label: string; re: RegExp; normalPresent: boolean }[] = [
  { sign: "bleeding", label: "vaginal bleeding", re: /\b(?:bleeding|spotting)\b/i, normalPresent: false },
  { sign: "fluid", label: "leakage of fluid", re: /\b(?:leak(?:ing|age)? (?:of )?fluid|water break|gush of fluid|fluid leaking)\b/i, normalPresent: false },
  { sign: "contractions", label: "contractions", re: /\bcontractions?\b|\btightening\b/i, normalPresent: false },
  { sign: "movement", label: "fetal movement", re: /\b(?:baby(?:'s)? mov(?:e|ing|ement)|feel(?:ing)? (?:the )?baby|kicks?|fetal movement)\b/i, normalPresent: true },
];

const DENY = /\b(?:no|not|none|denies|haven't|hasn't|don't|nope|never)\b/i;
const AFFIRM = /\b(?:yes|yeah|a little|some|sometimes|lots|a lot|all the time|moving (?:a lot|well|great|plenty)|kicking)\b/i;

export function extractPrenatal(utts: Utterance[], preg: Pregnancy | null | undefined, at: Date): PrenatalFacts {
  const all = utts;
  let ga: PrenatalFacts["ga"] = preg?.edd ? { ...gaFrom(preg.edd, at), source: "edd" } : null;
  if (!ga) {
    for (const u of all) {
      const m = /\b(\d{1,2})\s+weeks?(?:\s+(?:and\s+)?(\d)\s+days?)?\b/i.exec(u.text);
      if (m && /\b(?:pregnant|along|gestation|you're|you are)\b/i.test(u.text)) {
        ga = { weeks: Number(m[1]), days: m[2] ? Number(m[2]) : 0, source: "stated" };
        break;
      }
    }
  }
  let fundalHeight: PrenatalFacts["fundalHeight"] = null;
  let fhr: PrenatalFacts["fhr"] = null;
  let urineProtein: PrenatalFacts["urineProtein"] = null;
  let bp: PrenatalFacts["bp"] = null;
  const preeclampsia: PrenatalFacts["preeclampsia"] = [];
  for (const u of all) {
    const t = u.text;
    const fh = /\b(?:fundal height|measuring|you measure)\b[^.]*?\b(\d{2})\s*(?:cm|centimeters?)\b/i.exec(t);
    if (fh && !fundalHeight) fundalHeight = { cm: Number(fh[1]), evidence: [u.id] };
    const hr = /\b(?:baby'?s? heart(?: ?rate|beat)?|heart ?beat|fetal heart(?: ?rate| tones)?|FHT|doppler)\b[^.]*?\b(1\d{2})s?\b/i.exec(t);
    if (hr && !fhr) fhr = { bpm: Number(hr[1]), evidence: [u.id] };
    const up = /\burine\b[^.]*?\b(negative|trace|1\+|2\+|3\+|one plus|two plus|three plus)\b(?:[^.]*\bprotein\b)?|\bprotein\b[^.]*\b(negative|trace|1\+|2\+|3\+)/i.exec(t);
    if (up && !urineProtein && /\bprotein\b/i.test(t)) urineProtein = { value: (up[1] ?? up[2]).replace(/one plus/i, "1+").replace(/two plus/i, "2+").replace(/three plus/i, "3+").toLowerCase(), evidence: [u.id] };
    const b = /\b(?:blood pressure|BP)\b[^\d?]{0,30}?(\d{2,3})\s*(?:over|\/)\s*(\d{2,3})/i.exec(t);
    if (b && !bp) bp = { sys: Number(b[1]), dia: Number(b[2]), evidence: [u.id] };
    if (u.speaker !== "clinician") {
      for (const [label, re] of [["headache", /\bheadaches?\b/i], ["vision changes", /\b(?:spots|blurry|blurred|vision)\b/i], ["right upper abdominal pain", /\b(?:pain|hurts?)\b[^.]*\b(?:under my ribs|upper (?:right )?(?:belly|stomach|abdomen))\b/i], ["swelling of face or hands", /\b(?:swelling|swollen|puffy)\b[^.]*\b(?:face|hands|fingers)\b/i]] as const) {
        const m = re.exec(t);
        if (m && !DENY.test(t.slice(0, m.index)) && !preeclampsia.some((p) => p.symptom === label)) preeclampsia.push({ symptom: label, evidence: [u.id] });
      }
    }
  }
  const warning: PrenatalFacts["warning"] = [];
  for (const s of SIGNS) {
    let present: boolean | null = null;
    const ev: string[] = [];
    utts.forEach((u, i) => {
      if (!s.re.test(u.text)) return;
      ev.push(u.id);
      if (u.speaker === "clinician" && /\?/.test(u.text)) {
        const ans = utts.slice(i + 1, i + 3).find((x) => x.speaker !== "clinician");
        if (ans) {
          ev.push(ans.id);
          if (s.normalPresent) present = AFFIRM.test(ans.text) && !/\b(?:less|not as much|hasn't|haven't)\b/i.test(ans.text) ? true : DENY.test(ans.text) || /\bless\b/i.test(ans.text) ? false : present;
          else present = DENY.test(ans.text) ? false : AFFIRM.test(ans.text) ? true : present;
        }
      } else if (u.speaker !== "clinician") {
        const m = s.re.exec(u.text)!;
        const neg = DENY.test(u.text.slice(0, m.index));
        present = s.normalPresent ? !(neg || /\bless\b/i.test(u.text)) : !neg;
      }
    });
    warning.push({ sign: s.sign, present, evidence: Array.from(new Set(ev)) });
  }
  return { ga, fundalHeight, fhr, warning, preeclampsia, urineProtein, bp };
}

export function trimester(weeks: number) {
  return weeks < 14 ? 1 : weeks < 28 ? 2 : 3;
}

export function prenatalCodes(preg: Pregnancy | null | undefined, f: PrenatalFacts) {
  if (!f.ga) return [];
  const tri = trimester(f.ga.weeks);
  const first = (preg?.gravida ?? 1) <= 1;
  const z34 = `Z34.${first ? "0" : "8"}${tri}`;
  const label = `Encounter for supervision of normal ${first ? "first " : ""}pregnancy, ${["first", "second", "third"][tri - 1]} trimester`;
  const wk = Math.max(8, Math.min(42, f.ga.weeks));
  return [{ code: z34, label }, { code: f.ga.weeks < 8 ? "Z3A.01" : `Z3A.${String(wk).padStart(2, "0")}`, label: `${f.ga.weeks < 8 ? "Less than 8" : wk} weeks gestation of pregnancy` }];
}

export interface DueItem {
  key: string;
  text: string;
  flag?: boolean;
}

export function prenatalDue(preg: Pregnancy | null | undefined, f: PrenatalFacts): DueItem[] {
  const out: DueItem[] = [];
  const w = f.ga?.weeks;
  if (f.bp && (f.bp.sys >= 140 || f.bp.dia >= 90)) out.push({ key: "bp", text: `BP ${f.bp.sys}/${f.bp.dia} is in the hypertensive range: evaluate for gestational hypertension or preeclampsia (repeat BP, urine protein-to-creatinine ratio, CBC, CMP)${f.preeclampsia.length ? `; symptoms reported: ${f.preeclampsia.map((p) => p.symptom).join(", ")}` : ""}.`, flag: true });
  else if (f.preeclampsia.length && w !== undefined && w >= 20) out.push({ key: "pec", text: `Preeclampsia symptoms reported (${f.preeclampsia.map((p) => p.symptom).join(", ")}): check BP and urine protein.`, flag: true });
  if (w !== undefined && f.fundalHeight && w >= 20 && w <= 36 && Math.abs(f.fundalHeight.cm - w) > 2) out.push({ key: "fh", text: `Fundal height ${f.fundalHeight.cm} cm at ${w} weeks (more than 2 cm off): consider a growth ultrasound.`, flag: true });
  const mv = f.warning.find((x) => x.sign === "movement");
  if (w !== undefined && w >= 28 && mv?.present === false) out.push({ key: "fm", text: "Decreased fetal movement at 28 weeks or later: nonstress test today.", flag: true });
  for (const s of f.warning.filter((x) => x.sign !== "movement" && x.present)) out.push({ key: s.sign, text: `Reports ${s.sign === "fluid" ? "leakage of fluid" : s.sign}: evaluate today${s.sign === "fluid" ? " (sterile speculum exam, nitrazine/ferning)" : ""}.`, flag: true });
  if (w === undefined) return out;
  if (w >= 24 && w <= 28) out.push({ key: "gtt", text: "Glucose challenge test due (24 to 28 weeks)." });
  if (w >= 27 && w <= 36) out.push({ key: "tdap", text: "Tdap due (27 to 36 weeks), each pregnancy." });
  if (w >= 26 && w <= 28 && preg?.rh === "negative") out.push({ key: "rhogam", text: "Rh-negative: antibody screen and Rh immune globulin at 28 weeks." });
  if (w >= 36 && w <= 37) out.push({ key: "gbs", text: "Group B strep culture due (36 0/7 to 37 6/7 weeks)." });
  if (w >= 28 && w < 36) out.push({ key: "visits", text: "Visits every 2 weeks until 36 weeks." });
  if (w >= 36) out.push({ key: "visits", text: "Weekly visits from 36 weeks." });
  if (w >= 41) out.push({ key: "postdates", text: "41 weeks or later: antenatal testing and discuss induction.", flag: true });
  return out;
}

const s = (key: string, i: number, text: string, evidence: string[] = [], kind: NoteSentence["kind"] = "fact", support: NoteSentence["support"] = "strong"): NoteSentence => ({ id: `${key}_${i}`, text, evidence, kind, support });

export function pregnancySentences(preg: Pregnancy | null | undefined, f: PrenatalFacts, key: string): NoteSentence[] {
  const out: NoteSentence[] = [];
  const gp = preg?.gravida ? `G${preg.gravida}P${preg.para ?? 0}` : null;
  out.push(f.ga ? s(key, 1, `${[gp, `${f.ga.weeks} weeks ${f.ga.days} days`].filter(Boolean).join(" at ")}${f.ga.source === "edd" && preg?.edd ? ` by EDD ${preg.edd}` : " (stated)"}${preg?.rh ? `, Rh ${preg.rh}` : ""}.`, [], "carried") : s(key, 1, "Gestational age: ***", [], "system", "none"));
  return out;
}

export function warningSentences(f: PrenatalFacts, key: string): NoteSentence[] {
  const lbl = { bleeding: "vaginal bleeding", fluid: "leakage of fluid", contractions: "contractions", movement: "fetal movement" } as const;
  const reported = f.warning.filter((w) => w.present !== null);
  if (!reported.length) return [s(key, 1, "Warning signs (bleeding, leakage of fluid, contractions, fetal movement): ***", [], "system", "none")];
  const neg = reported.filter((w) => (w.sign === "movement" ? w.present : !w.present));
  const pos = reported.filter((w) => !neg.includes(w));
  const out: NoteSentence[] = [];
  const fm = reported.find((w) => w.sign === "movement");
  const denied = neg.filter((w) => w.sign !== "movement").map((w) => lbl[w.sign]);
  const parts = [fm?.present ? "Reports active fetal movement" : null, denied.length ? `denies ${denied.join(", ")}` : null].filter(Boolean).join("; ");
  if (parts) out.push(s(key, out.length + 1, `${parts.charAt(0).toUpperCase()}${parts.slice(1)}.`, neg.flatMap((w) => w.evidence)));
  for (const w of pos) out.push(s(key, out.length + 1, w.sign === "movement" ? "Reports decreased fetal movement." : `Reports ${lbl[w.sign]}.`, w.evidence));
  const missing = f.warning.filter((w) => w.present === null).map((w) => lbl[w.sign]);
  if (missing.length) out.push(s(key, out.length + 1, `Not asked: ${missing.join(", ")}. ***`, [], "system", "none"));
  return out;
}

export function obExamSentences(f: PrenatalFacts, key: string): NoteSentence[] {
  const out: NoteSentence[] = [];
  out.push(f.fundalHeight ? s(key, 1, `Fundal height: ${f.fundalHeight.cm} cm.`, f.fundalHeight.evidence) : s(key, 1, "Fundal height: *** cm.", [], "system", "none"));
  out.push(f.fhr ? s(key, 2, `Fetal heart rate: ${f.fhr.bpm} bpm.`, f.fhr.evidence) : s(key, 2, "Fetal heart rate: *** bpm.", [], "system", "none"));
  if (f.urineProtein) out.push(s(key, 3, `Urine protein: ${f.urineProtein.value}.`, f.urineProtein.evidence));
  return out;
}

export function dueSentences(items: DueItem[], key: string): NoteSentence[] {
  if (!items.length) return [s(key, 1, "Nothing time-sensitive due at this gestational age.", [], "system")];
  return items.map((d, i) => s(key, i + 1, d.flag ? `Flag: ${d.text}` : d.text, [], "system"));
}
