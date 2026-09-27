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
    model: llmModel(),
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
    meta: { engine: "claude", model: llmModel(), templateId: template.id, generatedAt: new Date().toISOString() },
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
