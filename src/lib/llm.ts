import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Chart, Note, Patient, PatientSummary, StyleRule, Template, Utterance } from "./types";
import { styleInstructions } from "./engine/style";

export const DEFAULT_MODEL = "claude-opus-5";

export function llmEnabled() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) && process.env.CHARTSIDE_ENGINE !== "local";
}

export function llmModel() {
  return process.env.CHARTSIDE_MODEL || DEFAULT_MODEL;
}

let client: Anthropic | null = null;
function anthropic() {
  client ??= new Anthropic();
  return client;
}

const NoteSchema = z.object({
  sections: z.array(
    z.object({
      key: z.string(),
      sentences: z.array(
        z.object({
          text: z.string(),
          evidence: z.array(z.string()),
          heading: z.boolean(),
          indent: z.number().int(),
        }),
      ),
    }),
  ),
});

const SYSTEM = `You are Chartside, an ambient clinical documentation engine. You turn a clinician–patient conversation into a signed-quality clinical note.

Non-negotiable rules:
- Document only what was said in the transcript or is present in the supplied chart. Never invent vitals, results, exam findings, doses, or history. If something was not discussed, leave it out.
- Every sentence must cite the transcript line IDs it comes from in "evidence" (e.g. ["u12","u13"]). Use ["chart"] only for facts copied from the chart. A sentence with no support must not be written.
- Never write consent or attestation statements; those are recorded separately by the system.
- Write in concise, professional clinical language in the third person. Convert lay language to clinical terms without changing meaning.
- Assessment & Plan is problem-oriented: a heading sentence per problem formatted "1. <diagnosis> (<ICD-10-CM code>) — <status if stated>" with heading=true, followed by plan items with indent=1 (medications with dose and frequency, orders, referrals, counseling). Close with follow-up interval and return precautions.
- Pertinent negatives the patient explicitly denied belong in the HPI or ROS.
- Keep the clinician's own reasoning when they verbalize it.
- Use the exact section keys provided. Output an empty sentence list for a section with nothing supported.`;

function transcriptBlock(utterances: Utterance[]) {
  return utterances
    .filter((u) => !u.redacted)
    .map((u) => `[${u.id}] ${u.speaker.toUpperCase()}: ${u.text}`)
    .join("\n");
}

export async function generateNoteWithClaude(input: {
  utterances: Utterance[];
  patient: Patient | null;
  template: Template;
  reason: string;
  visitType: string;
  rules: StyleRule[];
  model?: string;
}): Promise<Note> {
  const { utterances, patient, template, rules } = input;
  const sectionSpec = template.sections
    .map((s) => `- key "${s.key}" — "${s.title}" (${s.kind}, ${s.format})${s.instructions ? `: ${s.instructions}` : ""}`)
    .join("\n");
  const style = styleInstructions(rules);
  const user = `Visit reason: ${input.reason || "not stated"} (${input.visitType})
Patient: ${patient ? `${patient.name}, DOB ${patient.dob}, sex ${patient.sex}, pronouns ${patient.pronouns || "unspecified"}` : "unknown"}
Chart (JSON): ${JSON.stringify(patient?.chart ?? {})}

Template "${template.name}" (verbosity: ${template.style.verbosity ?? "standard"}):
${sectionSpec}
${style ? `\nClinician style preferences learned from prior edits:\n${style}\n` : ""}
Transcript:
${transcriptBlock(utterances)}`;

  const response = await anthropic().messages.parse({
    model: input.model || llmModel(),
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(NoteSchema) },
  });
  if (response.stop_reason === "refusal") throw new Error("Model declined to generate this note");
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Model returned an unparseable note");
  const byKey = new Map(parsed.sections.map((s) => [s.key, s]));
  return {
    sections: template.sections.map((ts) => {
      const got = byKey.get(ts.key);
      return {
        key: ts.key,
        title: ts.title,
        format: ts.format,
        sentences: (got?.sentences ?? []).map((s, i) => ({
          id: `${ts.key}_c${i + 1}`,
          text: s.text.trim(),
          evidence: s.evidence,
          kind: s.evidence.length === 1 && s.evidence[0] === "chart" ? ("carried" as const) : ("fact" as const),
          support: "strong" as const,
          heading: s.heading || undefined,
          indent: s.indent || undefined,
        })),
      };
    }),
    meta: { engine: "claude", model: input.model || llmModel(), templateId: template.id, generatedAt: new Date().toISOString() },
  };
}

const SummarySchema = z.object({
  greeting: z.string(),
  sections: z.array(z.object({ title: z.string(), items: z.array(z.string()) })),
});

export async function translateSummaryWithClaude(summary: PatientSummary, lang: string): Promise<PatientSummary> {
  const response = await anthropic().messages.parse({
    model: llmModel(),
    max_tokens: 8000,
    system: "Translate patient after-visit summaries into the requested language at a 6th-grade reading level. Preserve medication names, doses, numbers, and meaning exactly. Do not add or remove clinical content.",
    messages: [{ role: "user", content: `Target language: ${lang}\n\n${JSON.stringify({ greeting: summary.greeting, sections: summary.sections })}` }],
    output_config: { format: zodOutputFormat(SummarySchema) },
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) throw new Error("Translation unavailable");
  return { ...summary, lang, greeting: response.parsed_output.greeting, sections: response.parsed_output.sections, warnings: [] };
}

const VisitRecapSchema = z.object({
  headline: z.string(),
  discussed: z.array(z.string()),
  diagnoses: z.array(z.object({ term: z.string(), plain: z.string() })),
  meds: z.array(z.object({ name: z.string(), change: z.string(), text: z.string() })),
  nextSteps: z.array(z.object({ text: z.string(), when: z.string().nullable() })),
  questions: z.array(z.string()),
  watchFor: z.array(z.string()),
});

export async function visitRecapWithClaude(input: { utterances: Utterance[]; draft: z.infer<typeof VisitRecapSchema> }) {
  const response = await anthropic().messages.parse({
    model: llmModel(),
    max_tokens: 4000,
    system: "You write a plain-English recap of a doctor visit for the patient who recorded it. Write at a 6th-grade reading level, second person, warm and short. Use only what was said in the transcript. Never invent diagnoses, doses, dates or results. Keep medicine names and doses exactly as said. Do not use em dashes. 'change' is one of: New, Stop, Higher dose, Lower dose, Changed, Keep taking, Refilled. Questions are ones the patient could ask at the next visit. Always end watchFor with 'Call 911 for any emergency.' Any count in the headline must equal the number of items in the matching list.",
    messages: [{ role: "user", content: `Transcript:\n${transcriptBlock(input.utterances)}\n\nA draft from our rule-based engine, for reference:\n${JSON.stringify(input.draft)}` }],
    output_config: { format: zodOutputFormat(VisitRecapSchema) },
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) throw new Error("Recap unavailable");
  return response.parsed_output;
}

const AssistSchema = z.object({
  reply: z.string(),
  citations: z.array(z.string()),
  edits: z.array(
    z.object({
      sectionKey: z.string(),
      sentences: z.array(z.object({ text: z.string(), evidence: z.array(z.string()), heading: z.boolean(), indent: z.number().int() })),
    }),
  ),
});

export async function assistWithClaude(input: { message: string; note: Note | null; utterances: Utterance[]; chart?: Chart }) {
  const response = await anthropic().messages.parse({
    model: llmModel(),
    max_tokens: 8000,
    system: `You are Chartside's in-note assistant for a clinician. Either answer a question about this visit and chart (cite transcript IDs in "citations"), or, if asked to change the note, return full replacement sentence lists for only the sections you change in "edits". Never invent facts; every new sentence must cite transcript IDs or ["chart"], or be text the clinician dictated in their message (cite []). Keep replies under 80 words.`,
    messages: [
      {
        role: "user",
        content: `Clinician: ${input.message}\n\nCurrent note (JSON): ${JSON.stringify(input.note?.sections.map((s) => ({ key: s.key, title: s.title, sentences: s.sentences.map((x) => ({ text: x.text, evidence: x.evidence, heading: !!x.heading, indent: x.indent ?? 0 })) })) ?? [])}\n\nChart: ${JSON.stringify(input.chart ?? {})}\n\nTranscript:\n${transcriptBlock(input.utterances)}`,
      },
    ],
    output_config: { format: zodOutputFormat(AssistSchema) },
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) throw new Error("Assistant unavailable");
  return response.parsed_output;
}

export async function polishReplyWithClaude(input: { message: string; draft: string; chart?: Chart | null; lang: string }) {
  const response = await anthropic().messages.create({
    model: llmModel(),
    max_tokens: 2000,
    system: `You polish a clinician's draft reply to a patient portal message. Keep it warm, clear, and at a 6th-grade reading level, in ${input.lang === "es" ? "Spanish" : "English"}. Keep every clinical fact, number, medication, dose, and safety instruction exactly as in the draft, and never add clinical facts, diagnoses, or promises that are not in the draft or chart. Keep every "***" marker exactly where the clinician must decide something. Keep the greeting and sign-off. Reply with the message text only.`,
    messages: [{ role: "user", content: `Patient message:\n${input.message}\n\nChart:\n${JSON.stringify({ problems: input.chart?.problems ?? [], medications: input.chart?.medications ?? [], labs: input.chart?.labs ?? [] })}\n\nDraft reply:\n${input.draft}` }],
  });
  const text = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
  if (!text || response.stop_reason === "refusal") throw new Error("Draft unavailable");
  return text;
}

export async function answerFromEvidenceWithClaude(question: string, passages: { title: string; org: string; year: number; text: string }[], chart?: Chart | null) {
  const response = await anthropic().messages.create({
    model: llmModel(),
    max_tokens: 1200,
    system: "Answer a clinician's question using only the numbered guideline passages provided. Cite every claim with [n] matching a passage number. If the passages don't answer the question, say so. You may relate the guidance to the patient's chart, but never invent recommendations, doses, or grades. Keep it under 120 words.",
    messages: [{ role: "user", content: `Question: ${question}\n\nPatient chart: ${JSON.stringify({ problems: chart?.problems ?? [], medications: chart?.medications ?? [] })}\n\n${passages.map((p, i) => `[${i + 1}] ${p.org} ${p.year}, ${p.title}: ${p.text}`).join("\n\n")}` }],
  });
  const text = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
  const cited = [...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  if (!text || !cited.length || cited.some((n) => n < 1 || n > passages.length)) throw new Error("Unverified citations");
  return text;
}

export async function answerChartWithClaude(question: string, passages: { title: string; date: string | null; text: string }[]) {
  const response = await anthropic().messages.create({
    model: llmModel(),
    max_tokens: 600,
    system: "Answer a clinician's question about one patient using only the numbered chart excerpts. Cite every statement with [n]. Give dates when they appear. If the excerpts don't answer the question, say it isn't in the chart. Never infer results, doses, or diagnoses that are not written. Keep it under 80 words.",
    messages: [{ role: "user", content: `Question: ${question}\n\n${passages.map((p, i) => `[${i + 1}] ${p.title}${p.date ? ` (${p.date})` : ""}: ${p.text}`).join("\n")}` }],
  });
  const text = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
  const cited = [...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  if (!text || (!cited.length && !/isn't in the chart|not in the chart/i.test(text)) || cited.some((n) => n < 1 || n > passages.length)) throw new Error("Unverified citations");
  return text;
}

export async function playPatientWithClaude(input: { persona: string; facts: Record<string, string>; history: { role: "student" | "patient"; text: string }[]; question: string }) {
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  for (const h of input.history.slice(-16)) {
    const role = h.role === "student" ? "user" : "assistant";
    const last = messages.at(-1);
    if (last?.role === role) last.content += `\n${h.text}`;
    else messages.push({ role, content: h.text });
  }
  if (messages[0]?.role === "assistant") messages.shift();
  if (messages.at(-1)?.role === "user") messages.at(-1)!.content += `\n${input.question}`;
  else messages.push({ role: "user", content: input.question });
  const response = await anthropic().messages.create({
    model: llmModel(),
    max_tokens: 300,
    system: `You are a standardized patient in a medical student's practice encounter. Everything is fictional. Stay in character at all times.\n\n${input.persona}\n\nHidden facts, keyed by topic. Use them only when the student asks about that topic:\n${Object.entries(input.facts).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n\nRules:\n- Answer only what was asked, in 1 to 3 short spoken sentences, in plain everyday words. Never use medical jargon the character wouldn't know.\n- Never volunteer facts the student didn't ask about. Never list symptoms unprompted. Never give hints, diagnoses, or teaching.\n- If asked about something not in the facts, give a plausible answer that is consistent and adds no new problems. For symptom questions not covered, say you haven't noticed that.\n- If the student asks to examine you, just agree briefly. The exam findings are shown separately.\n- If the student says something kind, respond naturally as the character.\n- Reply with the character's words only. No stage directions and no quotation marks.`,
    messages,
  });
  const text = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
  if (!text || response.stop_reason === "refusal") throw new Error("Patient unavailable");
  return text.replace(/^["“]|["”]$/g, "");
}

const StyleSchema = z.object({
  rules: z.array(z.object({ kind: z.enum(["drop_phrase", "always_include"]), section: z.string(), value: z.string(), label: z.string() })),
});

export async function styleRulesWithClaude(sample: string, sections: { key: string; title: string }[]) {
  const response = await anthropic().messages.parse({
    model: llmModel(),
    max_tokens: 2000,
    system: "You read one clinical note a clinician pasted as an example of how they write. Find at most 4 habits the structure checks cannot see: a closing line they always add (always_include, exact sentence, 20 words or fewer, no patient details), or a kind of line they never write (drop_phrase, the first 2 to 4 lowercase words of such a line). Use only the section keys given. Labels are short plain English. Return an empty list if nothing is clear.",
    messages: [{ role: "user", content: `Sections: ${sections.map((s) => `${s.key} (${s.title})`).join(", ")}\n\nExample note:\n${sample.slice(0, 6000)}` }],
    output_config: { format: zodOutputFormat(StyleSchema) },
  });
  const keys = new Set(sections.map((s) => s.key));
  return (response.parsed_output?.rules ?? []).filter((r) => keys.has(r.section) && r.value.trim() && r.value.split(/\s+/).length <= 20).slice(0, 4);
}
