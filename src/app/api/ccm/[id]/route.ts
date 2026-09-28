import type { CarePlanItem } from "@/lib/engine/ccm";
import { logTime, unenroll, updateCarePlan } from "@/lib/server/ccm";
import { authed, body, json } from "@/lib/server/http";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ minutes?: number; activity?: string; note?: string; at?: string }>(req);
  await logTime(user, id, b);
  return json({ ok: true }, 201);
});

export const PATCH = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ carePlan?: CarePlanItem[] }>(req);
  await updateCarePlan(user, id, b.carePlan ?? []);
  return json({ ok: true });
});

export const DELETE = authed<{ id: string }>(async (_req, user, { id }) => {
  await unenroll(user, id);
  return json({ ok: true });
});
