import { actOnDecision, getDecision, type DecisionAction } from "@/lib/server/decisions";
import { authed, body, fail, json } from "@/lib/server/http";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const d = await getDecision(user, decodeURIComponent(id));
  return d ? json(d) : fail("Decision not found", 404);
});

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ action?: DecisionAction; payload?: Record<string, unknown>; channel?: string }>(req);
  if (!b.action || !["approve", "reject", "snooze", "draft"].includes(b.action)) return fail("Choose approve, reject, snooze or draft");
  const r = await actOnDecision(user, decodeURIComponent(id), b.action, b.payload ?? {}, { channel: b.channel === "stack" ? "stack" : "web" });
  return json(r, r.ok ? 200 : 409);
});
