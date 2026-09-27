import { authed, body, fail, json } from "@/lib/server/http";
import { reviseDiagnoses } from "@/lib/server/pipeline";
import { assertCan } from "@/lib/server/policy";
import { encounters } from "@/lib/server/repo";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  assertCan(user, "clinical.edit");
  const b = await body<{ action?: "answer" | "add" | "remove"; queryId?: string; code?: string | null }>(req);
  try {
    if (b.action === "answer" && b.queryId) return json(await reviseDiagnoses(user, enc.id, { kind: "answer", queryId: b.queryId, code: b.code ?? null }));
    if (b.action === "add" && b.code) return json(await reviseDiagnoses(user, enc.id, { kind: "add", code: b.code }));
    if (b.action === "remove" && b.code) return json(await reviseDiagnoses(user, enc.id, { kind: "remove", code: b.code }));
    return fail("Unknown coding action");
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not update coding", 422);
  }
});
