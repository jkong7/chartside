import type { Patient, Utterance } from "../types";
import type { Facts } from "./extract";
import { buildPatientSummary } from "./summary";
import { intervalDays } from "./tasks";
import { ageFrom } from "./text";

export type DocType = "patient_letter" | "work_note" | "school_note" | "return_to_play" | "medical_necessity" | "fmla" | "jury_duty" | "caregiver" | "general";

export interface DocField {
  key: string;
  label: string;
  type: "date" | "text" | "textarea";
  required?: boolean;
  help?: string;
}

export interface DocContext {
  facts: Facts;
  utterances: Utterance[];
  patient: Patient | null;
  clinician: { name: string; specialty: string; credential?: string };
  org: { name: string };
  visitDate: Date;
}

export interface DocDefinition {
  type: DocType;
  label: string;
  description: string;
  fields: DocField[];
  detect?: RegExp;
  prefill: (ctx: DocContext) => Record<string, string>;
  render: (v: Record<string, string>, ctx: Pick<DocContext, "patient" | "clinician" | "org" | "visitDate">) => { title: string; body: string };
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const long = (s: string) => (s ? new Date(`${s}T12:00:00`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "***");
const plus = (d: Date, days: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

const RESTRICTION = /\b(no (?:heavy )?lifting(?: (?:over|more than) \d+ (?:pounds|lbs?))?|no (?:running|contact sports|sports|gym|pe|physical education|driving|climbing)(?: for [^.,;]+)?|light duty|desk duty|limit(?:ed)? (?:standing|walking)[^.,;]*|elevate (?:the|her|his|their) [a-z]+|(?:needs|may need) (?:frequent )?breaks[^.,;]*|work from home[^.,;]*|use (?:the )?(?:crutches|splint|brace|sling|boot)[^.,;]*)/gi;
const RETURN = /\b(?:back to (?:work|school)|return(?:ing)? to (?:work|school|practice|sports|play)|go back to (?:work|school))\s+(tomorrow|today|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|in (?:\d+|a|an|one|two|three|four|five|six|seven|a couple of|a few) (?:day|week)s?|next week)/i;
const OFF = /\b(?:stay home|out of (?:work|school)|off (?:work|school)|rest)\s+(?:for\s+)?((?:\d+|a|an|one|two|three|four|five|six|seven|a couple of|a few) (?:day|week)s?)/i;
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function returnDate(utts: Utterance[], visit: Date) {
  for (const u of utts) {
    const m = RETURN.exec(u.text);
    if (m) {
      const w = m[1].toLowerCase();
      if (w === "today") return { date: iso(visit), evidence: [u.id] };
      if (w === "tomorrow") return { date: iso(plus(visit, 1)), evidence: [u.id] };
      if (w === "next week") return { date: iso(plus(visit, 7 - visit.getDay() + 1)), evidence: [u.id] };
      const day = DAYS.findIndex((d) => w.includes(d));
      if (day >= 0) return { date: iso(plus(visit, ((day - visit.getDay() + 7) % 7) || 7)), evidence: [u.id] };
      const n = intervalDays(w);
      if (n) return { date: iso(plus(visit, n)), evidence: [u.id] };
    }
    const off = OFF.exec(u.text);
    if (off) {
      const n = intervalDays(off[1]);
      if (n) return { date: iso(plus(visit, n)), evidence: [u.id] };
    }
  }
  return null;
}

export function restrictionsFrom(utts: Utterance[]) {
  const out: string[] = [];
  for (const u of utts) {
    if (u.speaker !== "clinician") continue;
    for (const m of u.text.matchAll(RESTRICTION)) {
      const r = m[1].trim().replace(/\s+/g, " ");
      if (!out.some((x) => x.toLowerCase() === r.toLowerCase())) out.push(r.charAt(0).toUpperCase() + r.slice(1));
    }
  }
  return out;
}

function mainProblem(f: Facts) {
  const p = f.problems.find((x) => !x.fromSymptom) ?? f.problems[0];
  return p ? { label: p.label, icd10: p.icd10 } : f.chiefComplaint ? { label: f.chiefComplaint.label, icd10: "" } : null;
}

function header(ctx: Pick<DocContext, "org" | "visitDate">, date?: string) {
  return [ctx.org.name, date ? long(date) : ctx.visitDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), ""];
}

function signature(ctx: Pick<DocContext, "clinician">) {
  return ["", "Sincerely,", "", `${ctx.clinician.name}${ctx.clinician.credential ? `, ${ctx.clinician.credential}` : ""}`, ctx.clinician.specialty];
}

const who = (p: Patient | null) => p?.name ?? "***";
const dobLine = (p: Patient | null) => (p ? `Date of birth: ${long(p.dob)}` : "");

export const DOCUMENTS: DocDefinition[] = [
  {
    type: "patient_letter",
    label: "Letter to patient",
    description: "A plain-language letter that recaps the visit: what we found, what changes, and what to do next.",
    fields: [{ key: "personal", label: "Personal note (optional)", type: "textarea" }],
    prefill: (c) => {
      const s = buildPatientSummary(c.facts, c.patient, "en");
      return { personal: "", summary: s.sections.map((x) => `${x.title}\n${x.items.map((i) => `  • ${i}`).join("\n")}`).join("\n\n") };
    },
    render: (v, c) => ({
      title: `Your visit on ${c.visitDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
      body: [...header(c), `Dear ${c.patient?.name.split(" ")[0] ?? "patient"},`, "", "Thank you for coming in. Here is a summary of what we talked about.", "", v.summary ?? "", ...(v.personal?.trim() ? ["", v.personal.trim()] : []), "", "If you have questions, send us a message or call the office.", ...signature(c)].join("\n"),
    }),
  },
  {
    type: "work_note",
    label: "Work note",
    description: "Excuses an absence and states when the patient can return and with what restrictions. Diagnosis is left out unless the patient asks.",
    detect: /\b(?:work (?:note|excuse|letter)|note for (?:my )?work|doctor'?s note for work|return to work (?:note|letter))\b/i,
    fields: [
      { key: "from", label: "Excused from", type: "date", required: true },
      { key: "return", label: "May return on", type: "date", required: true },
      { key: "restrictions", label: "Restrictions", type: "textarea", help: "One per line. Leave blank for full duty." },
      { key: "employer", label: "Employer (optional)", type: "text" },
    ],
    prefill: (c) => {
      const r = returnDate(c.utterances, c.visitDate);
      return { from: iso(c.visitDate), return: r?.date ?? iso(plus(c.visitDate, 1)), restrictions: restrictionsFrom(c.utterances).join("\n"), employer: "" };
    },
    render: (v, c) => {
      const rs = (v.restrictions ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
      return {
        title: `Work note for ${who(c.patient)}`,
        body: [
          ...header(c),
          `To ${v.employer?.trim() || "whom it may concern"}:`,
          "",
          `${who(c.patient)} was seen in our office on ${c.visitDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} and was unable to work from ${long(v.from)}. ${c.patient?.name.split(" ")[0] ?? "They"} may return to work on ${long(v.return)}${rs.length ? " with the following restrictions:" : " without restrictions."}`,
          ...rs.map((x) => `  • ${x}`),
          "",
          "Please contact our office with any questions.",
          ...signature(c),
        ].join("\n"),
      };
    },
  },
  {
    type: "school_note",
    label: "School note",
    description: "Excuses a student's absence and lists any activity limits or accommodations.",
    detect: /\b(?:school (?:note|excuse|form)|note for (?:school|his school|her school|their school)|note for (?:gym|pe))\b/i,
    fields: [
      { key: "from", label: "Absent from", type: "date", required: true },
      { key: "return", label: "May return on", type: "date", required: true },
      { key: "restrictions", label: "Activity limits or accommodations", type: "textarea" },
      { key: "school", label: "School (optional)", type: "text" },
    ],
    prefill: (c) => {
      const r = returnDate(c.utterances, c.visitDate);
      return { from: iso(c.visitDate), return: r?.date ?? iso(plus(c.visitDate, 1)), restrictions: restrictionsFrom(c.utterances).join("\n"), school: "" };
    },
    render: (v, c) => {
      const rs = (v.restrictions ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
      return {
        title: `School note for ${who(c.patient)}`,
        body: [
          ...header(c),
          `To ${v.school?.trim() ? `the staff of ${v.school.trim()}` : "the school nurse and teachers"}:`,
          "",
          `${who(c.patient)} (${dobLine(c.patient).replace("Date of birth: ", "born ")}) was seen in our office and should be excused from school starting ${long(v.from)}. ${c.patient?.name.split(" ")[0] ?? "The student"} may return on ${long(v.return)}.`,
          ...(rs.length ? ["", "Please allow the following:", ...rs.map((x) => `  • ${x}`)] : []),
          ...signature(c),
        ].join("\n"),
      };
    },
  },
  {
    type: "return_to_play",
    label: "Return to sports or activity",
    description: "Clears the patient for sports or physical activity, fully or with a stepwise plan.",
    detect: /\b(?:sports (?:physical|clearance|form)|clear(?:ed|ance)? (?:to|for) (?:play|sports|practice)|return to (?:play|sports|practice))\b/i,
    fields: [
      { key: "activity", label: "Sport or activity", type: "text", required: true },
      { key: "clearance", label: "Clearance", type: "text", required: true, help: "Full clearance, cleared with limits, or not cleared" },
      { key: "date", label: "Effective date", type: "date", required: true },
      { key: "plan", label: "Limits or stepwise plan", type: "textarea" },
    ],
    prefill: (c) => ({ activity: /\b(soccer|basketball|football|baseball|softball|volleyball|tennis|swim(?:ming)?|track|running|hockey|lacrosse|wrestling|dance|gymnastics|cheer(?:leading)?)\b/i.exec(c.utterances.map((u) => u.text).join(" "))?.[1] ?? "", clearance: restrictionsFrom(c.utterances).length ? "Cleared with limits" : "Full clearance", date: returnDate(c.utterances, c.visitDate)?.date ?? iso(c.visitDate), plan: restrictionsFrom(c.utterances).join("\n") }),
    render: (v, c) => ({
      title: `Activity clearance for ${who(c.patient)}`,
      body: [
        ...header(c),
        "To the coach or athletic trainer:",
        "",
        `${who(c.patient)} was evaluated in our office. Status for ${v.activity || "***"}: ${v.clearance || "***"}, effective ${long(v.date)}.`,
        ...(v.plan?.trim() ? ["", "Limits and plan:", ...v.plan.split("\n").filter(Boolean).map((x) => `  • ${x.trim()}`)] : []),
        "",
        "Stop the activity and contact us if symptoms return.",
        ...signature(c),
      ].join("\n"),
    }),
  },
  {
    type: "medical_necessity",
    label: "Letter of medical necessity",
    description: "Supports coverage for a medication, device, or service with diagnosis, history, prior treatments, and results.",
    detect: /\b(?:letter of medical necessity|medical necessity letter|prior auth(?:orization)? letter|insurance (?:letter|won'?t cover))\b/i,
    fields: [
      { key: "item", label: "Requested medication, device, or service", type: "text", required: true },
      { key: "diagnosis", label: "Diagnosis and ICD-10-CM code", type: "text", required: true },
      { key: "history", label: "Clinical history", type: "textarea", required: true },
      { key: "tried", label: "Treatments already tried", type: "textarea", help: "One per line, with dates and outcomes if known" },
      { key: "payer", label: "Insurer", type: "text" },
    ],
    prefill: (c) => {
      const p = mainProblem(c.facts);
      const started = c.facts.meds.filter((m) => m.action === "start" && !m.cancelled);
      const tried = c.facts.meds.filter((m) => ["stop", "change", "side_effect", "not_taking"].includes(m.action)).map((m) => `${m.name}${m.note ? `: ${m.note}` : m.action === "side_effect" ? ": side effects" : ""}`);
      const results = c.facts.results.map((r) => `${r.name} ${r.value}`);
      return {
        item: started[0] ? [started[0].name, started[0].dose, started[0].frequency].filter(Boolean).join(" ") : c.facts.orders.find((o) => o.kind === "imaging" || o.kind === "procedure")?.name ?? "",
        diagnosis: p ? `${p.label}${p.icd10 ? ` (${p.icd10})` : ""}` : "",
        history: [p ? `${who(c.patient)} has ${p.label.toLowerCase()}.` : "", results.length ? `Pertinent results: ${results.join("; ")}.` : ""].filter(Boolean).join(" "),
        tried: tried.join("\n"),
        payer: c.patient?.chart.coverage?.plan ?? c.patient?.chart.coverage?.payer ?? "",
      };
    },
    render: (v, c) => ({
      title: `Letter of medical necessity: ${v.item || "***"}`,
      body: [
        ...header(c),
        `To: ${v.payer?.trim() || "Utilization review"}`,
        `Re: ${who(c.patient)}${c.patient ? `, ${dobLine(c.patient)}${c.patient.chart.coverage?.memberId ? `, member ID ${c.patient.chart.coverage.memberId}` : ""}` : ""}`,
        "",
        `I am writing to request coverage of ${v.item || "***"} for my patient, ${who(c.patient)}${c.patient ? `, age ${ageFrom(c.patient.dob, c.visitDate)}` : ""}, who is under my care for ${v.diagnosis || "***"}.`,
        "",
        v.history || "***",
        ...(v.tried?.trim() ? ["", "Treatments already tried:", ...v.tried.split("\n").filter(Boolean).map((x) => `  • ${x.trim()}`)] : []),
        "",
        `In my clinical judgment, ${v.item || "this treatment"} is medically necessary for this patient. Please contact me if you need additional records.`,
        ...signature(c),
      ].join("\n"),
    }),
  },
  {
    type: "fmla",
    label: "FMLA certification narrative",
    description: "Answers the medical questions on FMLA certification forms (condition, onset, duration of incapacity, flare-up frequency).",
    detect: /\bfmla\b|\bdisability (?:form|paperwork|claim)\b|\bleave of absence\b/i,
    fields: [
      { key: "condition", label: "Serious health condition", type: "text", required: true },
      { key: "onset", label: "Approximate onset date", type: "date", required: true },
      { key: "duration", label: "Expected duration of incapacity", type: "text", required: true },
      { key: "episodes", label: "Frequency and duration of flare-ups", type: "text", help: "For intermittent leave, e.g. 2 episodes per month lasting 1 to 2 days" },
      { key: "treatment", label: "Treatment schedule", type: "textarea", help: "Appointments, therapy, procedures" },
      { key: "unable", label: "Job functions the patient cannot perform", type: "textarea" },
    ],
    prefill: (c) => {
      const p = mainProblem(c.facts);
      const fu = c.facts.followUp?.interval;
      return { condition: p ? `${p.label}${p.icd10 ? ` (${p.icd10})` : ""}` : "", onset: "", duration: "", episodes: "", treatment: fu ? `Follow-up visits every ${fu}.` : "", unable: restrictionsFrom(c.utterances).join("\n") };
    },
    render: (v, c) => ({
      title: `FMLA medical certification for ${who(c.patient)}`,
      body: [
        ...header(c),
        `Patient: ${who(c.patient)}${c.patient ? `, ${dobLine(c.patient)}` : ""}`,
        "",
        `1. Condition: ${v.condition || "***"}`,
        `2. Approximate date the condition began: ${v.onset ? long(v.onset) : "***"}`,
        `3. Expected duration of incapacity: ${v.duration || "***"}`,
        `4. Frequency and duration of flare-ups: ${v.episodes || "Not applicable"}`,
        `5. Treatment schedule: ${v.treatment || "***"}`,
        `6. Essential job functions the patient cannot perform: ${v.unable?.trim() ? v.unable.split("\n").filter(Boolean).join("; ") : "None"}`,
        ...signature(c),
      ].join("\n"),
    }),
  },
  {
    type: "jury_duty",
    label: "Jury duty excusal",
    description: "Requests excusal or deferral from jury service for medical reasons.",
    detect: /\bjury duty\b|\bjury service\b/i,
    fields: [
      { key: "request", label: "Request", type: "text", required: true, help: "Excusal or deferral until a date" },
      { key: "reason", label: "Medical reason", type: "textarea", required: true },
    ],
    prefill: (c) => ({ request: "Excusal from jury service", reason: mainProblem(c.facts) ? `A medical condition (${mainProblem(c.facts)!.label.toLowerCase()}) that makes prolonged sitting and full-day attendance unsafe.` : "" }),
    render: (v, c) => ({
      title: `Jury duty letter for ${who(c.patient)}`,
      body: [...header(c), "To the Jury Commissioner:", "", `I am the treating clinician for ${who(c.patient)}${c.patient ? ` (${dobLine(c.patient)})` : ""}. I am requesting ${(v.request || "***").toLowerCase()} because of ${v.reason || "***"}`, ...signature(c)].join("\n"),
    }),
  },
  {
    type: "caregiver",
    label: "Caregiver letter",
    description: "Confirms that a family member provides care, for employers or leave requests.",
    detect: /\bcaregiver (?:letter|note)\b|\bnote for my (?:husband|wife|son|daughter|mom|mother|dad|father|partner)\b/i,
    fields: [
      { key: "caregiver", label: "Caregiver's name and relationship", type: "text", required: true },
      { key: "care", label: "Care they provide", type: "textarea", required: true },
      { key: "until", label: "Needed through", type: "date" },
    ],
    prefill: () => ({ caregiver: "", care: "", until: "" }),
    render: (v, c) => ({
      title: `Caregiver letter for ${who(c.patient)}`,
      body: [...header(c), "To whom it may concern:", "", `${who(c.patient)} is my patient and needs help with daily care. ${v.caregiver || "***"} provides that care, including ${v.care || "***"}.${v.until ? ` This support is needed through ${long(v.until)}.` : ""}`, ...signature(c)].join("\n"),
    }),
  },
  {
    type: "general",
    label: "To whom it may concern",
    description: "A general-purpose letter on your letterhead.",
    fields: [
      { key: "recipient", label: "Recipient", type: "text" },
      { key: "body", label: "Letter text", type: "textarea", required: true },
    ],
    prefill: () => ({ recipient: "", body: "" }),
    render: (v, c) => ({ title: `Letter regarding ${who(c.patient)}`, body: [...header(c), `To ${v.recipient?.trim() || "whom it may concern"}:`, "", `Re: ${who(c.patient)}${c.patient ? `, ${dobLine(c.patient)}` : ""}`, "", v.body || "***", ...signature(c)].join("\n") }),
  },
];

export function docDef(type: string) {
  return DOCUMENTS.find((d) => d.type === type);
}

export function missingFields(def: DocDefinition, values: Record<string, string>) {
  return def.fields.filter((f) => f.required && !values[f.key]?.trim()).map((f) => f.label);
}

export function requestedDocs(utts: Utterance[]) {
  const out: { type: DocType; evidence: string[] }[] = [];
  for (const u of utts) for (const d of DOCUMENTS) if (d.detect?.test(u.text) && !out.some((x) => x.type === d.type)) out.push({ type: d.type, evidence: [u.id] });
  return out;
}
