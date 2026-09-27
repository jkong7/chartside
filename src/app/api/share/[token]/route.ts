import { fail, json } from "@/lib/server/http";
import { artifacts, encounterByShareToken, patientFlags, patients, users, utterances } from "@/lib/server/repo";
import type { PatientSummary } from "@/lib/types";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const enc = encounterByShareToken(token);
  if (!enc) return fail("This link is no longer valid", 404);
  const summaries = artifacts.get<Record<string, PatientSummary>>(enc.id, "summaries") ?? {};
  const patient = enc.patientId ? patients.get(enc.userId, enc.patientId) : undefined;
  const lang = patient?.language && summaries[patient.language] ? patient.language : enc.outputLang && summaries[enc.outputLang] ? enc.outputLang : "en";
  const clinician = users.byId(enc.userId);
  return json({
    firstName: patient?.name.split(" ")[0] ?? null,
    clinician: clinician?.name ?? "Your clinician",
    date: enc.scheduledAt,
    lang,
    summaries,
    transcript: utterances.list(enc.id).filter((u) => !u.redacted).map((u) => ({ id: u.id, speaker: u.speaker, text: u.text })),
    flags: patientFlags.list(enc.id).map((f) => ({ item: f.item, comment: f.comment, resolved: !!f.resolved })),
  });
}
