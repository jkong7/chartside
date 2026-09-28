import { all, get, now, run, uid } from "../db";
import { stagedFrom, SYSTEM_SETS, validItems, type OrderSet, type OrderSetItem } from "../engine/ordersets";
import { syncTasks } from "./inbox";
import { assertCan, can, Forbidden, Invalid } from "./policy";
import { refreshDraftClaim } from "./pipeline";
import { audit, encounters, j, orders, patients, type User } from "./repo";

interface Row {
  id: string;
  owner_id: string | null;
  name: string;
  items: string;
}

const toSet = (r: Row): OrderSet => ({ id: r.id, name: r.name, scope: r.owner_id ? "personal" : "org", items: j(r.items, []) });

export async function listOrderSets(u: User): Promise<OrderSet[]> {
  const rows = await all<Row>("SELECT id, owner_id, name, items FROM order_sets WHERE org_id = ? AND (owner_id IS NULL OR owner_id = ?) ORDER BY name", u.orgId, u.id);
  return [...rows.map(toSet), ...SYSTEM_SETS];
}

export async function saveOrderSet(u: User, input: { name?: string; items?: OrderSetItem[]; scope?: "org" | "personal" }) {
  assertCan(u, "clinical.edit");
  const name = (input.name ?? "").trim();
  if (!name) throw new Invalid("Name the order set");
  const items = validItems(input.items ?? []);
  if (!items.length) throw new Invalid("Add at least one order from the catalog");
  if (input.scope === "org" && !can(u, "org.manage")) throw new Forbidden("Only admins can publish order sets to the whole organization");
  const id = uid("oset_");
  await run("INSERT INTO order_sets (id, org_id, owner_id, name, items, created_at) VALUES (?, ?, ?, ?, ?, ?)", id, u.orgId, input.scope === "org" ? null : u.id, name.slice(0, 80), JSON.stringify(items), now());
  await audit.log(u, null, "order_set.created", { id, scope: input.scope === "org" ? "org" : "personal", items: items.length });
  return toSet((await get<Row>("SELECT id, owner_id, name, items FROM order_sets WHERE id = ?", id))!);
}

export async function deleteOrderSet(u: User, id: string) {
  const r = await get<Row>("SELECT id, owner_id, name, items FROM order_sets WHERE org_id = ? AND id = ?", u.orgId, id);
  if (!r) throw new Error("Order set not found");
  if (r.owner_id ? r.owner_id !== u.id : !can(u, "org.manage")) throw new Forbidden("You can't delete this order set");
  await run("DELETE FROM order_sets WHERE id = ?", id);
}

export async function applyOrderSet(u: User, encId: string, setId: string) {
  assertCan(u, "clinical.edit");
  const enc = await encounters.get(u, encId);
  if (!enc) throw new Error("Encounter not found");
  if (enc.status === "signed") throw new Invalid("Signed visits are locked");
  const set = (await listOrderSets(u)).find((s) => s.id === setId);
  if (!set) throw new Error("Order set not found");
  const patient = enc.patientId ? await patients.get(u, enc.patientId) : undefined;
  const cur = await orders.list(enc.id);
  const have = new Set(cur.filter((o) => o.status !== "rejected").map((o) => o.name.toLowerCase()));
  const added = set.items.filter((i) => !have.has(i.name.toLowerCase())).map((i) => stagedFrom(i, patient?.chart, new Date(enc.scheduledAt), set.name));
  const saved = await orders.replace(enc.id, [...cur.map(({ id: _id, ...o }) => o), ...added]);
  await audit.log(u, enc.id, "order_set.applied", { setId, name: set.name, added: added.length });
  await syncTasks(u, enc);
  await refreshDraftClaim(u, enc);
  return { orders: saved, added: added.length, skipped: set.items.length - added.length };
}
