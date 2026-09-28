import type { Chart } from "../types";
import { detectLang } from "./lang";
import { readingGrade } from "./text";

export type MessageIntent = "refill" | "result" | "appointment" | "side_effect" | "form" | "billing" | "symptom" | "other";
export type Urgency = "emergency" | "same_day" | "routine";

export interface Triage {
  urgency: Urgency;
  intent: MessageIntent;
  reasons: string[];
  lang: "en" | "es";
  meds: string[];
  labs: string[];
}

const EMERGENCY: { re: RegExp; label: string }[] = [
  { re: /\bchest (?:pain|pressure|tightness)|pressure in (?:my )?chest|dolor (?:de|en el) pecho/i, label: "chest pain" },
  { re: /\bcan'?t breathe|cannot breathe|trouble breathing|hard to breathe|struggling to breathe|no puedo respirar|me falta el aire/i, label: "trouble breathing" },
  { re: /\bsuicid|kill myself|want to die|end(?:ing)? (?:my life|it all)|hurt(?:ing)? myself|better off dead|(?:don'?t|do not) want to (?:live|be here|wake up)|no reason to live|quitarme la vida|matarme|no quiero vivir/i, label: "thoughts of self-harm" },
  { re: /\boverdos|took too many (?:pills|tablets)/i, label: "possible overdose" },
  { re: /\bface (?:is )?droop|slurred speech|can'?t (?:move|feel) (?:my )?(?:arm|leg|face)|weakness on one side|worst headache of my life/i, label: "stroke symptoms" },
  { re: /\bthroat (?:is )?(?:closing|swelling|swollen)|tongue (?:is )?swelling|anaphyla|lips (?:are )?swelling/i, label: "severe allergic reaction" },
  { re: /\bpassed out|fainted|blacked out|seizure|me desmay/i, label: "fainting or seizure" },
  { re: /\b(?:coughing|throwing|vomiting) (?:up )?blood|black,? tarry stool|bleeding (?:that )?won'?t stop|heavy bleeding/i, label: "serious bleeding" },
];

const SAME_DAY: { re: RegExp; label: string }[] = [
  { re: /\bfever|temperature of 1\d\d|temp (?:of )?1\d\d|fiebre/i, label: "fever" },
  { re: /\bvomiting|can'?t keep (?:anything|food|fluids|water) down|vómit/i, label: "vomiting" },
  { re: /\b(?:getting|much|a lot) worse|worsening|not getting better|peor/i, label: "worsening symptoms" },
  { re: /\b(?:pain|it) is (?:an? )?(?:8|9|10)(?:\/10| out of 10)?\b|severe pain|unbearable/i, label: "severe pain" },
  { re: /\bswelling|swollen|hinchad/i, label: "swelling" },
  { re: /\bred and (?:hot|warm)|pus|infected|infection/i, label: "possible infection" },
  { re: /\bdizz|lightheaded|mareo/i, label: "dizziness" },
  { re: /\brash|hives|ronchas/i, label: "rash" },
  { re: /\bblood (?:in|when)|bleeding/i, label: "bleeding" },
];

const INTENTS: { intent: MessageIntent; re: RegExp }[] = [
  { intent: "refill", re: /\b(?:refill|renew|run(?:ning)? out|ran out|out of my|more (?:pills|medicine|medication)|new prescription|resurtir|receta|se me acab)/i },
  { intent: "result", re: /\b(?:results?|labs?|blood ?work|a1c|test(?:s)? (?:came|back)|x-?ray|mri|ct scan|ultrasound|cholesterol|resultado|análisis|examen de sangre)\b/i },
  { intent: "side_effect", re: /\b(?:side effects?|upsets? my stomach|making me (?:sick|dizzy|nauseous|tired)|since (?:i )?start(?:ed)?|efecto secundario|me cae mal)/i },
  { intent: "form", re: /\b(?:form|paperwork|work note|school note|note for (?:work|school)|fmla|disability|letter for|formulario|carta)\b/i },
  { intent: "appointment", re: /\b(?:appointment|reschedule|schedule|cancel|come in|be seen|see (?:the )?(?:doctor|you)|cita|agendar)\b/i },
  { intent: "billing", re: /\b(?:bill|billing|charged?|invoice|insurance|copay|statement|factura|cobro|seguro)\b/i },
];

const LAB_ALIASES: { re: RegExp; name: RegExp }[] = [
  { re: /\ba1c|sugar|diabetes|glucose|azúcar/i, name: /a1c/i },
  { re: /\bcholesterol|ldl|lipid|colesterol/i, name: /ldl|cholesterol|lipid/i },
  { re: /\bkidney|egfr|creatinine|riñ/i, name: /egfr|creatinine/i },
  { re: /\bthyroid|tsh|tiroides/i, name: /tsh|thyroid/i },
  { re: /\bpotassium|potasio/i, name: /potassium/i },
  { re: /\bblood count|cbc|hemoglobin\b|anemia/i, name: /cbc|hemoglobin(?! a1c)/i },
];

export function triageMessage(body: string, chart?: Chart | null): Triage {
  const reasons: string[] = [];
  let urgency: Urgency = "routine";
  for (const e of EMERGENCY) if (e.re.test(body)) reasons.push(e.label);
  if (reasons.length) urgency = "emergency";
  else {
    for (const s of SAME_DAY) if (s.re.test(body)) reasons.push(s.label);
    if (reasons.length) urgency = "same_day";
  }
  const meds = (chart?.medications ?? []).filter((m) => new RegExp(`\\b${m.name.split(/\s+/)[0].replace(/[^a-z]/gi, "")}`, "i").test(body)).map((m) => m.name);
  const labs = (chart?.labs ?? []).filter((l) => LAB_ALIASES.some((a) => a.re.test(body) && a.name.test(l.name)) || body.toLowerCase().includes(l.name.toLowerCase())).map((l) => l.name);
  let intent: MessageIntent = INTENTS.find((i) => i.re.test(body))?.intent ?? "other";
  if (intent === "other" && meds.length && /\b(?:making|causing|since|after)\b/i.test(body)) intent = "side_effect";
  if (intent === "other" && (urgency !== "routine" || SAME_DAY.some((s) => s.re.test(body)))) intent = "symptom";
  if (intent === "other" && labs.length) intent = "result";
  const lang = detectLang(body) === "es" ? "es" : "en";
  return { urgency, intent, reasons, lang, meds, labs };
}

export interface DraftContext {
  patientFirst: string;
  clinician: string;
  chart?: Chart | null;
  lastVisit?: { date: string; plan: string[] } | null;
  lang?: "en" | "es";
}

export interface Draft {
  text: string;
  lang: "en" | "es";
  readingGrade: number;
  placeholders: number;
  actions: { kind: "refill" | "appointment" | "document" | "callback" | "billing"; title: string }[];
}

const fmtDay = (iso: string, lang: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "long", day: "numeric" });

function labLine(l: NonNullable<Chart["labs"]>[number], lang: "en" | "es") {
  const a1c = /a1c/i.test(l.name);
  if (lang === "es") {
    const how = l.flag === "high" ? (a1c ? "Está por encima de nuestra meta de menos de 7 %." : "Está un poco más alto de lo normal.") : l.flag === "low" ? "Está un poco más bajo de lo normal." : "Está dentro del rango normal.";
    return `Su ${l.name} fue ${l.value} el ${fmtDay(l.date, "es")}. ${how}`;
  }
  const how = l.flag === "high" ? (a1c ? "That is above our goal of under 7%." : "That is higher than the normal range.") : l.flag === "low" ? "That is lower than the normal range." : "That is in the normal range.";
  return `Your ${l.name} was ${l.value} on ${fmtDay(l.date, "en")}. ${how}`;
}

export const PLACEHOLDER = "***";

export function draftReply(body: string, triage: Triage, ctx: DraftContext): Draft {
  const lang = ctx.lang ?? triage.lang;
  const es = lang === "es";
  const chart = ctx.chart;
  const lines: string[] = [];
  const actions: Draft["actions"] = [];
  const med = triage.meds[0] ? chart?.medications.find((m) => m.name === triage.meds[0]) : undefined;
  const medText = med ? [med.name, med.dose, med.frequency].filter(Boolean).join(" ") : null;
  lines.push(es ? `Hola ${ctx.patientFirst}:` : `Hi ${ctx.patientFirst},`);
  if (triage.urgency === "emergency") {
    lines.push(es ? `Por lo que describe (${triage.reasons.join(", ")}), llame al 911 o vaya a la sala de emergencias más cercana ahora mismo. No espere una respuesta por este medio.` : `Because you mentioned ${triage.reasons.join(" and ")}, please call 911 or go to the nearest emergency room right now. Do not wait for a reply to this message.`);
    if (triage.reasons.includes("thoughts of self-harm")) lines.push(es ? "También puede llamar o enviar un mensaje de texto al 988 (Línea de Prevención del Suicidio y Crisis) en cualquier momento." : "You can also call or text 988, the Suicide and Crisis Lifeline, at any time.");
    lines.push(es ? `Nuestro equipo también le llamará hoy. ${PLACEHOLDER}` : `Our team will also call you today. ${PLACEHOLDER}`);
  } else if (triage.intent === "refill") {
    const recent = ctx.lastVisit && Date.now() - new Date(ctx.lastVisit.date).getTime() < 365 * 86400000;
    if (medText && recent) {
      lines.push(es ? `Gracias por su mensaje. Envié una receta de ${medText} a su farmacia.` : `Thanks for your message. I sent a refill of ${medText} to your pharmacy.`);
      actions.push({ kind: "refill", title: `Send refill: ${medText}` });
    } else if (medText) {
      lines.push(es ? `Gracias por su mensaje. Envié un suministro de 30 días de ${medText} a su farmacia. Como ha pasado más de un año desde su última visita, por favor haga una cita para que podamos seguir recetándolo.` : `Thanks for your message. I sent a 30-day supply of ${medText} to your pharmacy. Because it has been more than a year since your last visit, please make an appointment so we can keep refilling it.`);
      actions.push({ kind: "refill", title: `Send 30-day refill: ${medText}` });
      actions.push({ kind: "appointment", title: "Schedule overdue visit" });
    } else {
      lines.push(es ? `Gracias por su mensaje. ¿Qué medicamento necesita y cuál es su farmacia? ${PLACEHOLDER}` : `Thanks for your message. Which medication do you need refilled, and which pharmacy should we send it to? ${PLACEHOLDER}`);
    }
  } else if (triage.intent === "result") {
    const labs = (chart?.labs ?? []).filter((l) => triage.labs.includes(l.name));
    const show = labs.length ? labs : [...(chart?.labs ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    if (show.length) {
      lines.push(es ? "Gracias por preguntar por sus resultados." : "Thanks for asking about your results.");
      for (const l of show) lines.push(labLine(l, lang));
      if (ctx.lastVisit?.plan.length) lines.push(es ? `Como hablamos el ${fmtDay(ctx.lastVisit.date, "es")}, el plan es: ${ctx.lastVisit.plan.join("; ")}.` : `As we discussed on ${fmtDay(ctx.lastVisit.date, "en")}, the plan is: ${ctx.lastVisit.plan.join("; ")}.`);
      lines.push(PLACEHOLDER);
    } else {
      lines.push(es ? `Todavía no tengo esos resultados. Le escribiré en cuanto lleguen. ${PLACEHOLDER}` : `I don't have those results yet. I'll message you as soon as they come in. ${PLACEHOLDER}`);
      actions.push({ kind: "callback", title: "Send results when they arrive" });
    }
  } else if (triage.intent === "side_effect") {
    lines.push(es ? `Siento que ${medText ?? "el medicamento"} le esté causando molestias. Gracias por avisarme.` : `I'm sorry ${medText ?? "the medication"} is causing you trouble, and thank you for letting me know.`);
    lines.push(PLACEHOLDER);
  } else if (triage.intent === "form") {
    lines.push(es ? "Recibí su solicitud. Completaré el formulario y estará listo en 3 días hábiles." : "I received your request. I'll complete the paperwork, and it will be ready within 3 business days.");
    actions.push({ kind: "document", title: "Complete requested paperwork" });
  } else if (triage.intent === "appointment") {
    lines.push(es ? "Con gusto le atenderemos. Nuestra recepción le llamará para programar la cita." : "I'd be glad to see you. Our front desk will call you to set up a time.");
    actions.push({ kind: "appointment", title: "Schedule appointment" });
  } else if (triage.intent === "billing") {
    lines.push(es ? "Envié su pregunta a nuestro equipo de facturación, que se comunicará con usted." : "I've passed your question to our billing team, and they will contact you directly.");
    actions.push({ kind: "billing", title: "Route to billing" });
  } else {
    lines.push(es ? `Gracias por avisarme. ${PLACEHOLDER}` : `Thank you for letting me know. ${PLACEHOLDER}`);
  }
  if (triage.urgency === "same_day") {
    lines.push(es ? `Por lo que describe (${triage.reasons.join(", ")}), queremos hablar con usted hoy. Si empeora, tiene dificultad para respirar o dolor de pecho, llame al 911.` : `Because of the ${triage.reasons.join(" and ")} you described, we'd like to talk with you today. If it gets worse, or you have trouble breathing or chest pain, call 911.`);
  }
  lines.push(es ? `Saludos,\n${ctx.clinician}` : `Best,\n${ctx.clinician}`);
  const text = lines.join("\n\n");
  return { text, lang, readingGrade: readingGrade(text.replace(/\*\*\*/g, "")), placeholders: (text.match(/\*\*\*/g) ?? []).length, actions };
}
