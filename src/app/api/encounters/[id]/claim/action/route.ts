import { assertCan } from "@/lib/server/policy";
import { authed, body, fail, json } from "@/lib/server/http";
import type { Remit } from "@/lib/rcm/remit";
import { claimAction } from "@/lib/server/revenue";
import { audit, encounters } from "@/lib/server/repo";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  assertCan(user, "billing.review");
  const b = await body<{ action?: string; note?: string; opportunityId?: string; outcome?: "won" | "lost"; remit?: Partial<Remit> }>(req);
  try {
    const record = await claimAction(user, enc.id, b.action ?? "", { note: b.note, opportunityId: b.opportunityId, outcome: b.outcome, remit: b.remit });
    await audit.log(user, enc.id, `claim.${b.action}`, { status: record.status, charges: record.content.totals.charges, ...(b.action === "remit" ? { paid: record.lifecycle.remits.at(-1)?.totals.paid ?? 0 } : {}) });
    return json({ record });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not update claim", 422);
  }
});
