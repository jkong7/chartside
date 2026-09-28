import type { StagedOrder, Utterance } from "../types";
import type { Facts } from "./extract";

export type TaskKind = "follow_up" | "result_review" | "referral" | "document" | "callback" | "prior_auth" | "refill" | "message" | "other";

export interface TaskDraft {
  key: string;
  kind: TaskKind;
  title: string;
  detail: string;
  dueAt: string;
  evidence: string[];
}

export const TASK_LABEL: Record<TaskKind, string> = {
  follow_up: "Follow-up",
  result_review: "Results",
  referral: "Referral",
  document: "Document",
  callback: "Call patient",
  prior_auth: "Prior auth",
  refill: "Refill",
  message: "Message",
  other: "Task",
};

const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, couple: 2, few: 3 };

export function intervalDays(text: string): number | null {
  const m = /\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|couple(?: of)?|few)\s+(day|week|month|year)s?\b/i.exec(text);
  if (!m) return /\bnext year\b|\bannual/i.test(text) ? 365 : null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : WORDS[m[1].toLowerCase().replace(/ of$/, "")] ?? 1;
  const unit = m[2].toLowerCase();
  return n * (unit === "day" ? 1 : unit === "week" ? 7 : unit === "month" ? 30 : 365);
}

function addDays(from: Date, days: number) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  d.setHours(17, 0, 0, 0);
  return d.toISOString();
}

const DOCS: { re: RegExp; name: string }[] = [
  { re: /\b(?:work (?:note|excuse|letter)|note for (?:my )?work|doctor'?s note for work|return to work (?:note|letter))\b/i, name: "Work note" },
  { re: /\b(?:school (?:note|excuse|form)|note for (?:school|his school|her school|their school)|sports (?:physical )?form|note for (?:gym|pe))\b/i, name: "School note" },
  { re: /\bfmla\b/i, name: "FMLA paperwork" },
  { re: /\bdisability (?:form|paperwork|claim)\b/i, name: "Disability paperwork" },
  { re: /\bjury duty\b/i, name: "Jury duty letter" },
  { re: /\b(?:dmv|handicap(?:ped)? (?:placard|parking)|disabled parking)\b/i, name: "Disabled parking form" },
  { re: /\b(?:letter of medical necessity|medical necessity letter)\b/i, name: "Letter of medical necessity" },
];

const CALLBACK = /\b(?:i'?ll|i will|we'?ll|we will|someone will|my nurse will|the nurse will)\s+(?:give you a call|call you|reach out|message you|send you a message|let you know)\b/i;

export function detectTasks(facts: Facts, orders: StagedOrder[], utts: Utterance[], ctx: { at: Date; paServices?: string[] }): TaskDraft[] {
  const out: TaskDraft[] = [];
  const add = (t: TaskDraft) => {
    if (!out.some((x) => x.key === t.key)) out.push(t);
  };
  const needs = facts.problems.filter((p) => p.def?.sdoh);
  if (needs.length) add({ key: "sdoh", kind: "referral", title: `Connect to community resources: ${needs.map((p) => p.def!.plain.en).join("; ")}`, detail: "Social needs came up during the visit. Refer to social work or a community resource line (211), and document the referral.", dueAt: addDays(ctx.at, 3), evidence: needs.flatMap((p) => p.evidence).slice(0, 3) });
  if (facts.followUp) {
    const days = intervalDays(facts.followUp.interval ?? facts.followUp.text);
    add({
      key: "follow_up",
      kind: "follow_up",
      title: days ? `Schedule follow-up in ${facts.followUp.interval ?? `${days} days`}` : "Schedule follow-up visit",
      detail: facts.followUp.text,
      dueAt: addDays(ctx.at, Math.max(1, Math.min(days ?? 14, 14))),
      evidence: facts.followUp.evidence,
    });
  }
  for (const o of orders) {
    if (o.status === "rejected") continue;
    if (o.kind === "lab" || o.kind === "imaging") {
      add({ key: `result:${o.name.toLowerCase()}`, kind: "result_review", title: `Review ${o.name} result`, detail: o.detail || `Ordered at this visit${o.problem ? ` for ${o.problem}` : ""}`, dueAt: addDays(ctx.at, o.kind === "lab" ? 5 : 10), evidence: o.evidence });
    } else if (o.kind === "referral") {
      add({ key: `referral:${o.name.toLowerCase()}`, kind: "referral", title: `Confirm ${o.name} appointment was scheduled`, detail: o.detail || "Referral placed at this visit. Close the loop when the consult note arrives.", dueAt: addDays(ctx.at, 14), evidence: o.evidence });
    } else if (o.kind === "medication" && /\brefill\b/i.test(`${o.name} ${o.detail}`)) {
      add({ key: `refill:${o.name.toLowerCase()}`, kind: "refill", title: `Send refill: ${o.name}`, detail: o.detail, dueAt: addDays(ctx.at, 1), evidence: o.evidence });
    }
  }
  for (const s of ctx.paServices ?? []) add({ key: `pa:${s.toLowerCase()}`, kind: "prior_auth", title: `Submit prior authorization: ${s}`, detail: "Payer criteria were checked; the packet is ready in Billing.", dueAt: addDays(ctx.at, 2), evidence: [] });
  for (const u of utts) {
    for (const d of DOCS) {
      if (d.re.test(u.text)) add({ key: `doc:${d.name.toLowerCase()}`, kind: "document", title: `Complete ${d.name.toLowerCase()}`, detail: `Requested during the visit: "${u.text.slice(0, 160)}"`, dueAt: addDays(ctx.at, 2), evidence: [u.id] });
    }
    if (u.speaker === "clinician" && CALLBACK.test(u.text)) {
      add({ key: "callback", kind: "callback", title: /result/i.test(u.text) ? "Call patient with results" : "Call patient back", detail: `You said: "${u.text.slice(0, 160)}"`, dueAt: addDays(ctx.at, 3), evidence: [u.id] });
    }
  }
  return out;
}
