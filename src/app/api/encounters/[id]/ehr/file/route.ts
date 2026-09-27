import { fileNote } from "@/lib/server/ehr";
import { authed, fail, json } from "@/lib/server/http";
import { encounters } from "@/lib/server/repo";

export const POST = authed<{ id: string }>(async (_req, user, { id }) => {
  const enc = encounters.get(user.id, id);
  if (!enc) return fail("Encounter not found", 404);
  try {
    const filing = await fileNote(user, enc.id);
    return json({ filing }, filing.status === "filed" ? 200 : 502);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Filing failed", 409);
  }
});
