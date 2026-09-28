import { apiHandler } from "@/lib/server/platform";
import { encounterOut } from "@/lib/server/apiv1";
import { Invalid } from "@/lib/server/policy";
import { encounters, patients } from "@/lib/server/repo";
import type { Encounter } from "@/lib/types";

export const GET = apiHandler("encounters:read", async (req, user) => {
  const u = new URL(req.url);
  const list = await encounters.list(user, { from: u.searchParams.get("from") ?? undefined, to: u.searchParams.get("to") ?? undefined, patientId: u.searchParams.get("patientId") ?? undefined });
  return { data: list.map((e) => ({ id: e.id, patientId: e.patientId, status: e.status, visitType: e.visitType, reason: e.reason, scheduledAt: e.scheduledAt, signedAt: e.signedAt })) };
});

export const POST = apiHandler("encounters:write", async (req, user) => {
  const b = (await req.json().catch(() => ({}))) as { patientId?: string; reason?: string; visitType?: Encounter["visitType"]; templateId?: string; scheduledAt?: string };
  if (!b.patientId || !(await patients.get(user, b.patientId))) throw new Invalid("patientId must reference an existing patient");
  const types: Encounter["visitType"][] = ["new", "follow-up", "acute", "annual", "telehealth"];
  const e = await encounters.create(user, { patientId: b.patientId, reason: (b.reason ?? "").slice(0, 200), visitType: types.includes(b.visitType!) ? b.visitType : "follow-up", templateId: b.templateId ?? "soap", scheduledAt: b.scheduledAt ?? new Date().toISOString(), setting: b.visitType === "telehealth" ? "telehealth" : "in-person" });
  return { data: await encounterOut(user, e.id) };
});
