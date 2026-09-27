import { authed, body, fail, json } from "@/lib/server/http";
import { audit, encounters, orders } from "@/lib/server/repo";

export const PATCH = authed<{ id: string; oid: string }>(async (req, user, { id, oid }) => {
  const enc = encounters.get(user.id, id);
  if (!enc) return fail("Encounter not found", 404);
  if (enc.status === "signed") return fail("Signed visits are locked", 409);
  const b = await body<{ status?: "staged" | "accepted" | "rejected"; override?: boolean }>(req);
  if (!b.status || !["staged", "accepted", "rejected"].includes(b.status)) return fail("Invalid status");
  const cur = orders.list(enc.id).find((o) => o.id === oid);
  if (!cur) return fail("Order not found", 404);
  if (b.status === "accepted" && cur.alerts.some((a) => a.level === "block") && !b.override) return fail("This order has a blocking safety alert. Override explicitly to accept it.", 422);
  const o = orders.setStatus(enc.id, oid, b.status);
  audit.log(user.id, enc.id, `order.${b.status}`, { order: cur.name, override: !!b.override });
  return json({ order: o });
});
