import { CALCULATORS, prefill, suggestedCalculators } from "@/lib/engine/calculators";
import { authed, fail, json } from "@/lib/server/http";
import { factsFor } from "@/lib/server/pipeline";
import { encounters, utterances } from "@/lib/server/repo";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  const hasTranscript = (await utterances.list(enc.id)).length > 0;
  const { facts, patient } = await factsFor(user, enc);
  const ctx = { patient: patient ? { dob: patient.dob, sex: patient.sex, chart: patient.chart } : null, facts: hasTranscript ? facts : null, at: new Date(enc.scheduledAt) };
  return json({
    suggested: suggestedCalculators(ctx),
    prefill: Object.fromEntries(CALCULATORS.map((c) => [c.id, prefill(c.id, ctx)])),
  });
});
