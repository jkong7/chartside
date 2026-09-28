import { authed, body, fail, json } from "@/lib/server/http";
import { syncTasks } from "@/lib/server/inbox";
import { refreshDraftClaim } from "@/lib/server/pipeline";
import { assertCan } from "@/lib/server/policy";
import { qualityFor } from "@/lib/server/quality";
import { audit, encounters, orders } from "@/lib/server/repo";
import type { StagedOrder } from "@/lib/types";

const KINDS: StagedOrder["kind"][] = ["lab", "imaging", "medication", "referral", "procedure", "vaccine", "follow_up"];

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  assertCan(user, "clinical.edit");
  if (enc.status === "signed") return fail("Signed visits are locked", 409);
  const b = await body<{ kind?: StagedOrder["kind"]; name?: string; detail?: string; problem?: string }>(req);
  const name = b.name?.trim();
  if (!name || !b.kind || !KINDS.includes(b.kind)) return fail("Choose an order type and name");
  const list = await orders.list(enc.id);
  if (list.some((o) => o.name.toLowerCase() === name.toLowerCase() && o.status !== "rejected")) return fail(`${name} is already on the order list`, 409);
  const next = [...list.map(({ id: _id, ...o }) => o), { kind: b.kind, name: name.slice(0, 120), detail: (b.detail ?? "").slice(0, 300), status: "accepted" as const, evidence: [], alerts: [], problem: b.problem ?? "" }];
  const saved = await orders.replace(enc.id, next);
  await audit.log(user, enc.id, "order.added", { order: name, kind: b.kind });
  await syncTasks(user, enc);
  await refreshDraftClaim(user, enc);
  const quality = await qualityFor(user, enc);
  return json({ orders: saved, quality }, 201);
});
