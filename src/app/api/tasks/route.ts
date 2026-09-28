import { authed, body, fail, json } from "@/lib/server/http";
import { tasks } from "@/lib/server/inbox";
import { assertCan } from "@/lib/server/policy";
import { audit, encounters, orgs, patients } from "@/lib/server/repo";

export const GET = authed(async (req, user) => {
  const status = new URL(req.url).searchParams.get("status") ?? "open";
  return json({ tasks: await tasks.forUser(user, status === "all" || status === "done" || status === "dismissed" ? status : "open") });
});

export const POST = authed(async (req, user) => {
  assertCan(user, "clinical.edit");
  const b = await body<{ title?: string; detail?: string; dueAt?: string; patientId?: string; encounterId?: string; assigneeId?: string }>(req);
  const title = b.title?.trim();
  if (!title) return fail("Give the task a title");
  if (b.patientId && !(await patients.get(user, b.patientId))) return fail("Patient not found", 404);
  const enc = b.encounterId ? await encounters.get(user, b.encounterId) : undefined;
  if (b.encounterId && !enc) return fail("Encounter not found", 404);
  const assigneeId = b.assigneeId ?? enc?.userId ?? user.id;
  if (assigneeId !== user.id) {
    const m = await orgs.membership(user.orgId, assigneeId);
    if (!m || m.status !== "active") return fail("Assign the task to an active member", 422);
  }
  const id = await tasks.create({ orgId: user.orgId, encounterId: enc?.id ?? null, patientId: b.patientId ?? enc?.patientId ?? null, assigneeId, kind: "other", key: `manual:${Date.now().toString(36)}`, title: title.slice(0, 160), detail: (b.detail ?? "").slice(0, 1000), dueAt: b.dueAt ? new Date(b.dueAt).toISOString() : null, source: "manual", createdBy: user.id });
  await audit.log(user, enc?.id ?? null, "task.created", { id, assigneeId });
  return json({ task: await tasks.get(user, id) }, 201);
});
