import { runTool, ToolError, type ToolContext } from "./tools";

type Out = { reply: string; citations: string[] };

const HELP = "I can read you the note, explain the codes, list what's waiting on you, show today's schedule, look up a patient's meds or results, and draft changes for you to approve. What would you like?";

async function call(ctx: ToolContext, name: string, input: Record<string, unknown>, cites: string[]) {
  const out = await runTool(ctx, name, input);
  cites.push(name);
  return out;
}

async function patientFor(ctx: ToolContext, text: string, cites: string[]) {
  const named = /(?:for|of|on)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/.exec(text)?.[1];
  if (named) {
    const hits = (await call(ctx, "find_patient", { query: named }, cites)) as { patientId: string; name: string }[];
    if (!hits.length) throw new ToolError(`I couldn't find a patient named ${named}.`);
    return hits[0];
  }
  return null;
}

export async function routeLocally(ctx: ToolContext, text: string): Promise<Out> {
  const t = text.toLowerCase();
  const cites: string[] = [];
  try {
    if (/\b(sign|order|submit)\b.*\b(note|claim|it)\b|\bsign it\b/.test(t) && !/\bwhat\b/.test(t)) {
      return { reply: "I can't sign, order or submit anything. Open your stack to review and sign on screen.", citations: [] };
    }
    if (/\b(queue|waiting|to sign|pending|to do|backlog)\b/.test(t)) {
      const q = (await call(ctx, "list_my_queue", {}, cites)) as { counts: { total: number }; top: { title: string }[] };
      if (!q.counts.total) return { reply: "Nothing is waiting on you.", citations: cites };
      return { reply: `${q.counts.total} item${q.counts.total === 1 ? " is" : "s are"} waiting. First up: ${q.top.slice(0, 3).map((x) => x.title).join("; ")}.`, citations: cites };
    }
    if (/\b(schedule|today|next patient|who('s| is) next)\b/.test(t)) {
      const s = (await call(ctx, "today_schedule", {}, cites)) as { time: string; patient: string | null; reason: string; status: string }[];
      const open = s.filter((x) => x.status !== "signed");
      if (!open.length) return { reply: "You have no more visits today.", citations: cites };
      return { reply: `You have ${open.length} visit${open.length === 1 ? "" : "s"} left today. Next is ${open[0].patient ?? "an unmatched visit"} at ${open[0].time}${open[0].reason ? ` for ${open[0].reason}` : ""}.`, citations: cites };
    }
    if (/\b(codes?|level|e\/m|billing|icd)\b/.test(t)) {
      const c = (await call(ctx, "explain_codes", {}, cites)) as { em?: { code: string; level: string }; diagnoses?: { code: string; label: string }[]; note?: string };
      if (!c.em) return { reply: c.note ?? "No codes yet.", citations: cites };
      return { reply: `This looks like a ${c.em.code}, ${c.em.level} complexity. Diagnoses: ${(c.diagnoses ?? []).map((d) => `${d.label} (${d.code})`).join(", ") || "none yet"}.`, citations: cites };
    }
    if (/\b(meds|medications?|allerg)/.test(t)) {
      const p = await patientFor(ctx, text, cites);
      const m = (await call(ctx, "get_meds", { patientId: p?.patientId }, cites)) as { medications: { name: string; dose?: string; frequency?: string }[]; allergies: { substance: string }[] };
      const meds = m.medications.map((x) => [x.name, x.dose, x.frequency].filter(Boolean).join(" ")).join(", ") || "no medications on file";
      return { reply: `${p ? `${p.name}: ` : ""}${meds}. Allergies: ${m.allergies.map((a) => a.substance).join(", ") || "none on file"}.`, citations: cites };
    }
    if (/\b(results?|labs?|a1c|egfr|potassium|cholesterol|ldl)\b/.test(t)) {
      const p = await patientFor(ctx, text, cites);
      const name = /\b(a1c|egfr|potassium|cholesterol|ldl)\b/.exec(t)?.[1] ?? "";
      const r = (await call(ctx, "get_results", { patientId: p?.patientId, name }, cites)) as { labs: { name: string; value: string; date: string }[] };
      if (!r.labs.length) return { reply: "I don't see matching results on file.", citations: cites };
      return { reply: r.labs.slice(0, 4).map((l) => `${l.name} ${l.value} on ${l.date.slice(0, 10)}`).join("; ") + ".", citations: cites };
    }
    if (/^(find|look up|pull up|search)\b/.test(t)) {
      const q = text.replace(/^(find|look up|pull up|search)( for)?\s+/i, "").replace(/\?$/, "");
      const hits = (await call(ctx, "find_patient", { query: q }, cites)) as { name: string; dob: string }[];
      return { reply: hits.length ? `Found ${hits.map((h) => `${h.name} (born ${h.dob})`).join(", ")}.` : `No patient matches ${q}.`, citations: cites };
    }
    if (/\b(add|remove|change|edit|make|fix|use|expand|shorten|keep|write|put|delete|mention|document)\b/.test(t)) {
      const r = (await call(ctx, "propose_note_edit", { instruction: text }, cites)) as { proposed: string };
      return { reply: r.proposed ? "I drafted that change. It's in your stack to approve." : "I couldn't draft that change.", citations: cites };
    }
    if (/\b(note|read|summary|summarize|what did)\b/.test(t)) {
      const n = (await call(ctx, "get_note", {}, cites)) as { text: string };
      return { reply: n.text, citations: cites };
    }
    return { reply: HELP, citations: [] };
  } catch (err) {
    if (err instanceof ToolError) return { reply: err.message, citations: cites };
    if (err instanceof Error && /didn't|couldn't|no note|say which|unknown/i.test(err.message)) return { reply: `I couldn't do that: ${err.message}`, citations: cites };
    throw err;
  }
}
