import { assertCan } from "@/lib/server/policy";
import { authed, body, fail, json } from "@/lib/server/http";
import { claimAction } from "@/lib/server/revenue";
import { audit, encounters } from "@/lib/server/repo";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  assertCan(user, "billing.review");
  const b = await body<{ action?: string; note?: string; opportunityId?: string }>(req);
  try {
    const record = await claimAction(user, enc.id, b.action ?? "", { note: b.note, opportunityId: b.opportunityId });
    await audit.log(user, enc.id, `claim.${b.action}`, { status: record.status, charges: record.content.totals.charges });
    return json({ record });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not update claim", 422);
  }
});
