import { assertCan } from "@/lib/server/policy";
import { buildPatientSummary } from "@/lib/engine/summary";
import { llmEnabled, translateSummaryWithClaude } from "@/lib/llm";
import { authed, body, fail, json } from "@/lib/server/http";
import { factsFor } from "@/lib/server/pipeline";
import { artifacts, encounters } from "@/lib/server/repo";
import type { PatientSummary } from "@/lib/types";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  assertCan(user, "clinical.edit");
  const b = await body<{ lang?: string }>(req);
  const lang = (b.lang ?? "en").toLowerCase();
  const { facts, patient } = await factsFor(user, enc);
  const summaries = (await artifacts.get<Record<string, PatientSummary>>(enc.id, "summaries")) ?? {};
  let s: PatientSummary | null = null;
  if (lang === "en" || lang === "es") s = buildPatientSummary(facts, patient, lang);
  if (lang !== "en" && llmEnabled()) {
    try {
      s = await translateSummaryWithClaude(summaries.en ?? buildPatientSummary(facts, patient, "en"), lang);
    } catch {
      if (!s) return fail("Translation is unavailable right now", 503);
    }
  }
  if (!s) return fail(`Offline translation supports English and Spanish. Add ANTHROPIC_API_KEY to translate into "${lang}".`, 422);
  summaries[lang] = s;
  await artifacts.set(enc.id, "summaries", summaries);
  return json({ summary: s });
});
