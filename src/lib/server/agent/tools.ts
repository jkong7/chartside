import type Anthropic from "@anthropic-ai/sdk";
import { noteToText } from "../../engine/note";
import type { CodingResult } from "../../types";
import { decisionCounts, listDecisions, proposeDecision } from "../decisions";
import { lastVisitFor } from "../inbox";
import { artifacts, encounters, notes, patients, type User } from "../repo";

export type PhiScope = "call" | "full";

export interface ToolContext {
  user: User;
  phiScope: PhiScope;
  encounterId: string | null;
  proposals: string[];
}

export class ToolError extends Error {}

type Input = Record<string, unknown>;
type Handler = (ctx: ToolContext, input: Input) => Promise<unknown>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function fullOnly(ctx: ToolContext) {
  if (ctx.phiScope === "call") throw new ToolError("Not available on this call. The clinician must enter their PIN or open the app.");
}

async function scopedEncounter(ctx: ToolContext, id: unknown) {
  const encId = str(id) || ctx.encounterId || "";
  if (!encId) throw new ToolError("Which visit? Pass encounterId.");
  if (ctx.phiScope === "call" && encId !== ctx.encounterId) throw new ToolError("On this call you can only work on the visit that was just recorded.");
  const enc = await encounters.get(ctx.user, encId);
  if (!enc) throw new ToolError("Visit not found");
  return enc;
}

async function scopedPatient(ctx: ToolContext, id: unknown) {
  let patientId = str(id);
  if (ctx.phiScope === "call") {
    const enc = ctx.encounterId ? await encounters.get(ctx.user, ctx.encounterId) : undefined;
    if (!enc?.patientId || (patientId && patientId !== enc.patientId)) throw new ToolError("On this call you can only look at the patient from the visit that was just recorded.");
    patientId = enc.patientId;
  }
  if (!patientId) throw new ToolError("Which patient? Use find_patient first.");
  const p = await patients.get(ctx.user, patientId);
  if (!p) throw new ToolError("Patient not found");
  return p;
}

async function propose(ctx: ToolContext, kind: Parameters<typeof proposeDecision>[1], payload: Input, summary?: string) {
  const id = await proposeDecision(ctx.user, kind, payload, { source: "agent", summary });
  ctx.proposals.push(id);
  return { proposed: id, note: "Saved as a card for the clinician to approve on screen. Nothing has changed yet." };
}

const obj = (props: Record<string, { type: string; description: string; enum?: string[] }>, required: string[] = []): Anthropic.Tool.InputSchema => ({ type: "object", properties: props, required });

export const TOOLS: (Anthropic.Tool & { run: Handler })[] = [
  {
    name: "list_my_queue",
    description: "Counts and titles of what is waiting on the clinician: notes to sign, co-signs, coding questions, patient messages, tasks, suggestions.",
    input_schema: obj({}),
    run: async (ctx) => {
      const counts = await decisionCounts(ctx.user);
      const top = (await listDecisions(ctx.user)).slice(0, 10).map((d) => ({ id: d.id, kind: d.kind, title: ctx.phiScope === "call" ? d.safeLabel : d.title }));
      return { counts, top };
    },
  },
  {
    name: "today_schedule",
    description: "The clinician's visits today with time, patient, reason, status and encounterId.",
    input_schema: obj({}),
    run: async (ctx) => {
      fullOnly(ctx);
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 86400000);
      const list = await encounters.list(ctx.user, { from: start.toISOString(), to: end.toISOString(), clinicianId: ctx.user.id });
      return Promise.all(list.map(async (e) => ({ encounterId: e.id, time: time(e.scheduledAt), patient: e.patientId ? (await patients.get(ctx.user, e.patientId))?.name ?? null : null, reason: e.reason, status: e.status })));
    },
  },
  {
    name: "find_patient",
    description: "Find a patient by name or MRN. Returns up to 5 matches with patientId.",
    input_schema: obj({ query: { type: "string", description: "Name, part of a name, or MRN" } }, ["query"]),
    run: async (ctx, input) => {
      fullOnly(ctx);
      const q = str(input.query).toLowerCase();
      if (q.length < 2) throw new ToolError("Give at least two letters");
      const words = q.split(/\s+/);
      return (await patients.list(ctx.user)).filter((p) => p.mrn.toLowerCase() === q || words.every((w) => p.name.toLowerCase().includes(w))).slice(0, 5).map((p) => ({ patientId: p.id, name: p.name, dob: p.dob, mrn: p.mrn }));
    },
  },
  {
    name: "summarize_patient",
    description: "Problems, medications, allergies and the last visit's plan for a patient.",
    input_schema: obj({ patientId: { type: "string", description: "patientId from find_patient or today_schedule" } }),
    run: async (ctx, input) => {
      const p = await scopedPatient(ctx, input.patientId);
      const last = await lastVisitFor(ctx.user, p.id);
      return { name: p.name, dob: p.dob, sex: p.sex, problems: p.chart.problems.map((x) => [x.name, x.icd10, x.status].filter(Boolean).join(" · ")), medications: p.chart.medications.map((m) => [m.name, m.dose, m.frequency].filter(Boolean).join(" ")), allergies: p.chart.allergies.map((a) => a.substance + (a.reaction ? ` (${a.reaction})` : "")), lastVisit: last ? { date: last.date.slice(0, 10), plan: last.plan } : null };
    },
  },
  {
    name: "get_results",
    description: "Recent lab results and vitals for a patient, newest first.",
    input_schema: obj({ patientId: { type: "string", description: "patientId" }, name: { type: "string", description: "Optional lab name filter, e.g. A1c" } }),
    run: async (ctx, input) => {
      const p = await scopedPatient(ctx, input.patientId);
      const f = str(input.name).toLowerCase();
      const labs = (p.chart.labs ?? []).filter((l) => !f || l.name.toLowerCase().includes(f)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
      return { labs, vitals: p.chart.vitals ?? {} };
    },
  },
  {
    name: "get_meds",
    description: "Current medications and allergies for a patient.",
    input_schema: obj({ patientId: { type: "string", description: "patientId" } }),
    run: async (ctx, input) => {
      const p = await scopedPatient(ctx, input.patientId);
      return { medications: p.chart.medications, allergies: p.chart.allergies };
    },
  },
  {
    name: "get_note",
    description: "The current draft or signed note for a visit.",
    input_schema: obj({ encounterId: { type: "string", description: "encounterId; defaults to the current visit" } }),
    run: async (ctx, input) => {
      const enc = await scopedEncounter(ctx, input.encounterId);
      const rec = await notes.latest(enc.id);
      return { encounterId: enc.id, status: enc.status, reason: enc.reason, text: rec ? noteToText(rec.content) : "No note yet." };
    },
  },
  {
    name: "explain_codes",
    description: "The E/M level and diagnosis codes suggested for a visit, with the reasoning.",
    input_schema: obj({ encounterId: { type: "string", description: "encounterId; defaults to the current visit" } }),
    run: async (ctx, input) => {
      const enc = await scopedEncounter(ctx, input.encounterId);
      const c = await artifacts.get<CodingResult>(enc.id, "coding");
      if (!c) return { note: "No codes yet. The note hasn't been drafted." };
      return { em: { code: c.em.code, level: c.em.level, patientType: c.em.patientType, problems: c.em.problems, data: c.em.data, risk: c.em.risk, timeBased: c.em.timeBased ?? null, auditRisk: c.em.auditRisk }, diagnoses: c.diagnoses.map((d) => ({ code: d.code, label: d.label, rationale: d.rationale })) };
    },
  },
  {
    name: "propose_note_edit",
    description: "Propose a change to a visit's note from a plain instruction. Creates a card the clinician approves on screen; it does not change the note.",
    input_schema: obj({ encounterId: { type: "string", description: "encounterId; defaults to the current visit" }, instruction: { type: "string", description: "What to change, e.g. 'add that she walks 30 minutes daily to social history'" } }, ["instruction"]),
    run: async (ctx, input) => {
      const enc = await scopedEncounter(ctx, input.encounterId);
      return propose(ctx, "note.edit", { encounterId: enc.id, message: str(input.instruction) });
    },
  },
  {
    name: "propose_dx_add",
    description: "Propose adding an ICD-10-CM diagnosis to a visit. Creates a card; nothing changes until approved.",
    input_schema: obj({ encounterId: { type: "string", description: "encounterId; defaults to the current visit" }, code: { type: "string", description: "ICD-10-CM code, e.g. E11.9" } }, ["code"]),
    run: async (ctx, input) => {
      const enc = await scopedEncounter(ctx, input.encounterId);
      return propose(ctx, "dx.add", { encounterId: enc.id, code: str(input.code) });
    },
  },
  {
    name: "propose_dx_remove",
    description: "Propose removing a diagnosis code from a visit. Creates a card; nothing changes until approved.",
    input_schema: obj({ encounterId: { type: "string", description: "encounterId; defaults to the current visit" }, code: { type: "string", description: "ICD-10-CM code to remove" } }, ["code"]),
    run: async (ctx, input) => {
      const enc = await scopedEncounter(ctx, input.encounterId);
      return propose(ctx, "dx.remove", { encounterId: enc.id, code: str(input.code) });
    },
  },
  {
    name: "propose_task",
    description: "Propose a follow-up task, like calling a patient with results. Creates a card; nothing is created until approved.",
    input_schema: obj({ title: { type: "string", description: "Short task title" }, detail: { type: "string", description: "Optional detail" }, dueInDays: { type: "number", description: "Optional days until due" }, encounterId: { type: "string", description: "Optional related visit" } }, ["title"]),
    run: async (ctx, input) => {
      const enc = input.encounterId || ctx.phiScope === "call" ? await scopedEncounter(ctx, input.encounterId) : undefined;
      const days = Number(input.dueInDays);
      return propose(ctx, "task.create", { title: str(input.title), detail: str(input.detail), dueAt: Number.isFinite(days) && days >= 0 ? new Date(Date.now() + days * 86400000).toISOString() : null, encounterId: enc?.id ?? null, patientId: enc?.patientId ?? null });
    },
  },
  {
    name: "draft_message_reply",
    description: "Propose a reply to a patient message (ids come from list_my_queue as msg:<id>). Creates a card; nothing is sent until approved.",
    input_schema: obj({ messageId: { type: "string", description: "Message id, with or without the msg: prefix" }, text: { type: "string", description: "The reply in plain language" } }, ["messageId", "text"]),
    run: async (ctx, input) => {
      fullOnly(ctx);
      return propose(ctx, "message.reply", { messageId: str(input.messageId).replace(/^msg:/, ""), text: str(input.text) });
    },
  },
  {
    name: "open_in_web",
    description: "A link to open something in the app: the stack of cards, a visit, a patient, or the inbox.",
    input_schema: obj({ what: { type: "string", description: "stack, encounter, patient or inbox", enum: ["stack", "encounter", "patient", "inbox"] }, id: { type: "string", description: "encounterId or patientId when needed" } }, ["what"]),
    run: async (ctx, input) => {
      const what = str(input.what);
      if (what === "encounter") return { path: `/encounters/${(await scopedEncounter(ctx, input.id)).id}` };
      if (what === "patient") return { path: `/patients/${(await scopedPatient(ctx, input.id)).id}` };
      if (what === "inbox") return { path: "/inbox" };
      return { path: ctx.proposals.length ? `/go/stack?focus=${encodeURIComponent(ctx.proposals.at(-1)!)}` : "/go/stack" };
    },
  },
];

export const TOOL_DEFS: Anthropic.Tool[] = TOOLS.map(({ run: _run, ...t }) => t);

export async function runTool(ctx: ToolContext, name: string, input: Input) {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) throw new ToolError(`Unknown tool ${name}`);
  return t.run(ctx, input ?? {});
}
