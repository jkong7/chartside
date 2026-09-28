import { authed, body, json } from "@/lib/server/http";
import { startNote } from "@/lib/server/inpatient";
import { Invalid } from "@/lib/server/policy";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ kind?: "progress" | "discharge" }>(req);
  if (b.kind !== "progress" && b.kind !== "discharge") throw new Invalid("Choose a progress note or discharge summary");
  return json({ encounterId: await startNote(user, id, b.kind) }, 201);
});
