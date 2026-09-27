import { resyncPatient } from "@/lib/server/ehr";
import { authed, fail, json } from "@/lib/server/http";

export const POST = authed<{ id: string }>(async (_req, user, { id }) => {
  try {
    return json({ patient: await resyncPatient(user, id) });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Resync failed", 409);
  }
});
