import { authed, body, fail, json } from "@/lib/server/http";
import { lastVisitFor, messages, receiveMessage } from "@/lib/server/inbox";
import { assertCan } from "@/lib/server/policy";
import { encounters, patients } from "@/lib/server/repo";

export const GET = authed(async (req, user) => {
  const open = new URL(req.url).searchParams.get("open") === "1";
  return json({ messages: await messages.list(user, { open }) });
});

export const POST = authed(async (req, user) => {
  assertCan(user, "patients.write");
  const b = await body<{ patientId?: string; body?: string; subject?: string; channel?: "phone" | "manual" | "portal" }>(req);
  const patient = b.patientId ? await patients.get(user, b.patientId) : undefined;
  if (!patient) return fail("Choose a patient", 422);
  const last = await lastVisitFor(user, patient.id);
  const enc = last?.encounterId ? await encounters.get(user, last.encounterId) : undefined;
  const assigneeId = enc?.userId ?? ((await encounters.list(user, { patientId: patient.id })).at(-1)?.userId ?? user.id);
  const id = await receiveMessage({ orgId: user.orgId, patient, assigneeId, body: b.body ?? "", subject: b.subject, channel: b.channel === "portal" ? "portal" : b.channel === "phone" ? "phone" : "manual", actor: user });
  return json({ message: await messages.get(user, id) }, 201);
});
