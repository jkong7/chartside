import { authed, fail, json } from "@/lib/server/http";
import { qualityFor } from "@/lib/server/quality";
import { encounters } from "@/lib/server/repo";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const enc = await encounters.get(user, id);
  if (!enc) return fail("Encounter not found", 404);
  return json({ quality: (await qualityFor(user, enc, { save: enc.status !== "signed" })) ?? [] });
});
