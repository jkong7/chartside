import { authed, body, fail, json } from "@/lib/server/http";
import { encounters, notes, patients } from "@/lib/server/repo";
import type { Encounter } from "@/lib/types";

export const GET = authed((req, user) => {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const list = encounters.list(user.id, { from, to }).map((e) => {
    const p = e.patientId ? patients.get(user.id, e.patientId) : undefined;
    return { ...e, patient: p ? { id: p.id, name: p.name, dob: p.dob, sex: p.sex, mrn: p.mrn, openLoops: p.chart.priorVisits?.[0]?.plan ?? [] } : null, noteVersion: notes.latest(e.id)?.version ?? 0 };
  });
  return json({ encounters: list });
});

export const POST = authed(async (req, user) => {
  const b = await body<Partial<Encounter>>(req);
  if (b.patientId && !patients.get(user.id, b.patientId)) return fail("Patient not found", 404);
  const e = encounters.create(user.id, {
    patientId: b.patientId ?? null,
    scheduledAt: b.scheduledAt ?? new Date().toISOString(),
    visitType: b.visitType ?? "follow-up",
    reason: b.reason ?? "",
    templateId: b.templateId ?? user.prefs.defaultTemplate ?? "soap",
    setting: b.setting ?? "in-person",
    inputLang: b.inputLang ?? "en",
    outputLang: b.outputLang ?? user.prefs.outputLang ?? "en",
  });
  return json({ encounter: e }, 201);
});
