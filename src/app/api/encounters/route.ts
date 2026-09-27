import { authed, body, fail, json } from "@/lib/server/http";
import { assertCan, can } from "@/lib/server/policy";
import { encounters, notes, orgs, patients } from "@/lib/server/repo";
import type { Encounter } from "@/lib/types";

export const GET = authed(async (req, user) => {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const list = await Promise.all((await encounters.list(user, { from, to })).map(async (e) => {
    const p = e.patientId ? await patients.get(user, e.patientId) : undefined;
    return { ...e, patient: p ? { id: p.id, name: p.name, dob: p.dob, sex: p.sex, mrn: p.mrn, openLoops: p.chart.priorVisits?.[0]?.plan ?? [] } : null, noteVersion: (await notes.latest(e.id))?.version ?? 0 };
  }));
  return json({ encounters: list });
});

export const POST = authed(async (req, user) => {
  assertCan(user, "clinical.capture");
  const b = await body<Partial<Encounter> & { clinicianId?: string }>(req);
  if (b.patientId && !(await patients.get(user, b.patientId))) return fail("Patient not found", 404);
  let clinicianId = user.id;
  if (b.clinicianId && b.clinicianId !== user.id) {
    const m = await orgs.membership(user.orgId, b.clinicianId);
    if (!m || m.status !== "active" || !["owner", "admin", "clinician"].includes(m.role)) return fail("Choose a clinician in your organization", 422);
    clinicianId = b.clinicianId;
  } else if (!can(user, "clinical.create")) {
    return fail("Scribes schedule visits for a clinician. Choose the clinician.", 422);
  }
  const e = await encounters.create(user, {
    clinicianId,
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
