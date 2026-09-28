import { assertCan } from "@/lib/server/policy";
import { authed, body, fail, json } from "@/lib/server/http";
import { syncTasks } from "@/lib/server/inbox";
import { audit, encounters, orders } from "@/lib/server/repo";

export const PATCH = authed<{ id: string; oid: string }>(async (req, user, { id, oid }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  assertCan(user, "clinical.edit");
  if (enc.status === "signed") return fail("Signed visits are locked", 409);
  const b = await body<{ status?: "staged" | "accepted" | "rejected"; override?: boolean }>(req);
  if (!b.status || !["staged", "accepted", "rejected"].includes(b.status)) return fail("Invalid status");
  const cur = (await orders.list(enc.id)).find((o) => o.id === oid);
  if (!cur) return fail("Order not found", 404);
  if (b.status === "accepted" && cur.alerts.some((a) => a.level === "block") && !b.override) return fail("This order has a blocking safety alert. Override explicitly to accept it.", 422);
  const o = await orders.setStatus(enc.id, oid, b.status);
  await audit.log(user, enc.id, `order.${b.status}`, { order: cur.name, override: !!b.override });
  await syncTasks(user, enc);
  return json({ order: o });
});
