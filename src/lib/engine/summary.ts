import type { Patient, PatientSummary } from "../types";
import type { Facts, MedFact } from "./extract";
import { SYMPTOMS } from "./lexicon";
import { readingGrade } from "./text";

type Lang = "en" | "es";

const T = {
  en: {
    greeting: (n: string) => `Thank you for coming in today, ${n}. Here is a summary of your visit.`,
    talked: "What we talked about",
    meds: "Your medicines",
    tests: "Tests and referrals",
    home: "What you can do at home",
    help: "When to get help right away",
    next: "Your next visit",
    notGoal: (x: string) => `Your ${x} is not at goal yet, so we are adjusting your treatment.`,
    stable: (x: string) => `Your ${x} is stable.`,
    improving: (x: string) => `Your ${x} is getting better.`,
    dx: (x: string) => `We think you have ${x}.`,
    sym: (x: string) => `We talked about your ${x}.`,
    start: (m: string) => `Start ${m}.`,
    stop: (m: string) => `Stop taking ${m}.`,
    increase: (m: string) => `Increase ${m}.`,
    decrease: (m: string) => `Lower ${m}.`,
    change: (m: string) => `Change to ${m}.`,
    cont: (m: string) => `Keep taking ${m}.`,
    refill: (m: string) => `We refilled ${m}.`,
    lab: (m: string) => `Lab test: ${m}`,
    imaging: (m: string) => `Imaging: ${m}`,
    referral: (m: string) => `Referral: ${m}. Our office will contact you to schedule.`,
    vaccine: (m: string) => `Vaccine: ${m}`,
    procedure: (m: string) => `Test: ${m}`,
    followUp: (i: string) => `Please come back in ${i}.`,
    call: "Call 911 for any emergency.",
    to: "to",
  },
  es: {
    greeting: (n: string) => `Gracias por venir hoy, ${n}. Aquí tiene un resumen de su visita.`,
    talked: "De qué hablamos",
    meds: "Sus medicamentos",
    tests: "Exámenes y referencias",
    home: "Qué puede hacer en casa",
    help: "Cuándo buscar ayuda de inmediato",
    next: "Su próxima visita",
    notGoal: (x: string) => `Su ${x} todavía no está en la meta, así que vamos a ajustar su tratamiento.`,
    stable: (x: string) => `Su ${x} está estable.`,
    improving: (x: string) => `Su ${x} está mejorando.`,
    dx: (x: string) => `Creemos que tiene ${x}.`,
    sym: (x: string) => `Hablamos de su ${x}.`,
    start: (m: string) => `Empiece a tomar ${m}.`,
    stop: (m: string) => `Deje de tomar ${m}.`,
    increase: (m: string) => `Aumente ${m}.`,
    decrease: (m: string) => `Reduzca ${m}.`,
    change: (m: string) => `Cambie a ${m}.`,
    cont: (m: string) => `Siga tomando ${m}.`,
    refill: (m: string) => `Renovamos la receta de ${m}.`,
    lab: (m: string) => `Examen de laboratorio: ${m}`,
    imaging: (m: string) => `Estudio de imagen: ${m}`,
    referral: (m: string) => `Referencia: ${m}. Nuestra oficina le llamará para hacer la cita.`,
    vaccine: (m: string) => `Vacuna: ${m}`,
    procedure: (m: string) => `Prueba: ${m}`,
    followUp: (i: string) => `Por favor regrese en ${i}.`,
    call: "Llame al 911 en caso de emergencia.",
    to: "a",
  },
};

const FREQ_ES: Record<string, string> = {
  daily: "una vez al día",
  "twice daily": "dos veces al día",
  "three times daily": "tres veces al día",
  "four times daily": "cuatro veces al día",
  "at bedtime": "antes de dormir",
  "as needed": "cuando lo necesite",
  weekly: "una vez a la semana",
};

const FREQ_EN: Record<string, string> = {
  daily: "once a day",
  "twice daily": "twice a day",
  "three times daily": "three times a day",
  "four times daily": "four times a day",
};

const REFERRAL_ES: Record<string, string> = {
  "Physical therapy": "fisioterapia",
  "Behavioral health": "salud mental",
  "Diabetes education": "educación sobre diabetes",
  Cardiology: "cardiología",
  Dermatology: "dermatología",
  Nutrition: "nutrición",
};

function unitsEs(i: string) {
  return i.replace(/\bdays?\b/, (m) => (m.endsWith("s") ? "días" : "día")).replace(/\bweeks?\b/, (m) => (m.endsWith("s") ? "semanas" : "semana")).replace(/\bmonths?\b/, (m) => (m.endsWith("s") ? "meses" : "mes")).replace(/\byears?\b/, (m) => (m.endsWith("s") ? "años" : "año"));
}

function freqText(f: string | undefined, lang: Lang) {
  if (!f) return "";
  if (lang === "es") {
    let out = f;
    for (const [k, v] of Object.entries(FREQ_ES)) out = out.replace(new RegExp(`\\b${k}\\b`), v);
    return out.replace(/with dinner/, "con la cena").replace(/with food/, "con comida").replace(/with breakfast/, "con el desayuno").replace(/\bfor (\d+) days\b/, "por $1 días");
  }
  let out = f;
  for (const [k, v] of Object.entries(FREQ_EN)) out = out.replace(new RegExp(`^${k}`), v);
  return out;
}

function medPhrase(m: MedFact, lang: Lang) {
  const t = T[lang];
  const dose = m.dose ? ` ${m.dose}` : "";
  const f = freqText(m.frequency, lang);
  const tail = f ? ` ${f}` : "";
  const dur = m.note && /^for /.test(m.note) ? (lang === "es" ? ` ${m.note.replace(/^for (\w+) (days|weeks?)/, (_x, n, u) => `por ${n} ${u.startsWith("day") ? "días" : "semanas"}`)}` : ` ${m.note.split(";")[0]}`) : "";
  switch (m.action) {
    case "start": return t.start(`${m.name}${dose}${tail}${dur}`);
    case "stop": return t.stop(m.name);
    case "increase": return t.increase(`${m.name} ${t.to}${dose}${tail}`);
    case "decrease": return t.decrease(`${m.name} ${t.to}${dose}${tail}`);
    case "change": return t.change(`${m.name}${m.note === "extended-release" ? (lang === "es" ? " de liberación prolongada" : " extended-release") : ""}${dose}${tail}`);
    case "continue": return t.cont(`${m.name}${tail}`);
    case "refill": return t.refill(m.name);
    default: return "";
  }
}

function toYou(s: string) {
  return s
    .replace(/^Counseled to /, "")
    .replace(/\btheir\b/g, "your")
    .replace(/\bthey\b/g, "you")
    .replace(/\bthemselves\b/g, "yourself")
    .replace(/^./, (c) => c.toUpperCase());
}

function precautionToYou(s: string) {
  return s
    .replace(/^Return precautions:\s*/, "")
    .replace(/\bpatient stands\b/g, "you stand")
    .replace(/\bpatient\b/g, "you")
    .replace(/\bthe office\b/g, "our office")
    .replace(/^./, (c) => c.toUpperCase());
}

export function buildPatientSummary(facts: Facts, patient: Patient | null, lang: Lang = "en"): PatientSummary {
  const t = T[lang];
  const first = patient?.name.split(" ")[0] ?? (lang === "es" ? "paciente" : "there");
  const warnings: string[] = [];
  const sections: PatientSummary["sections"] = [];

  const talked: string[] = [];
  for (const p of facts.problems) {
    const plain = p.def?.plain[lang] ?? (p.fromSymptom ? SYMPTOMS.find((s) => `sym_${s.key}` === p.key)?.plain[lang] : undefined) ?? p.label.toLowerCase();
    if (p.fromSymptom) talked.push(t.sym(plain));
    else if (p.status === "not at goal") talked.push(t.notGoal(plain));
    else if (p.status === "stable") talked.push(t.stable(plain));
    else if (p.status === "improving") talked.push(t.improving(plain));
    else if (!p.chronic) talked.push(t.dx(plain));
    else talked.push(t.stable(plain));
  }
  if (talked.length) sections.push({ title: t.talked, items: talked });

  const meds = facts.meds.filter((m) => !m.cancelled && ["start", "stop", "increase", "decrease", "change", "continue", "refill"].includes(m.action));
  const seen = new Set<string>();
  const medItems: string[] = [];
  for (const m of meds) {
    const k = `${m.name}:${m.action}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const phrase = medPhrase(m, lang);
    if (phrase) medItems.push(phrase);
  }
  if (medItems.length) sections.push({ title: t.meds, items: medItems });

  const tests = facts.orders.map((o) => {
    const name = o.name.replace(/^Referral to /, "");
    if (o.kind === "referral") return t.referral(lang === "es" ? REFERRAL_ES[name] ?? name : name);
    const when = o.detail ? (lang === "es" ? ` (${unitsEs(o.detail.replace(/^in /, "en ").replace(/^today$/, "hoy"))})` : ` (${o.detail})`) : "";
    return `${t[o.kind as "lab"](name)}${when}`;
  });
  if (tests.length) sections.push({ title: t.tests, items: tests });

  const home = facts.counseling.map((c) => toYou(c.text));
  if (home.length) {
    if (lang === "es") warnings.push("Home-care instructions were written in English during the visit; review the Spanish version before sending or enable Claude for full translation.");
    sections.push({ title: t.home, items: home });
  }

  const help: string[] = [];
  for (const p of facts.problems) for (const x of p.def?.precautions?.[lang] ?? []) if (!help.includes(x)) help.push(x);
  if (lang === "en") for (const r of facts.returnPrecautions) help.push(precautionToYou(r.text));
  help.push(t.call);
  sections.push({ title: t.help, items: help });

  if (facts.followUp?.interval) sections.push({ title: t.next, items: [t.followUp(lang === "es" ? unitsEs(facts.followUp.interval) : facts.followUp.interval)] });

  const body = sections.flatMap((s) => s.items).join(" ");
  return { lang, readingGrade: lang === "en" ? readingGrade(body) : 0, greeting: t.greeting(first), sections, warnings };
}

export function summaryToText(s: PatientSummary) {
  return [s.greeting, "", ...s.sections.flatMap((sec) => [sec.title, ...sec.items.map((i) => `• ${i}`), ""])].join("\n").trim();
}
