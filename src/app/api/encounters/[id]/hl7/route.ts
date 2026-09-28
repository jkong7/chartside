import { hl7Log, sendNoteHl7 } from "@/lib/server/hl7";
import { authed, json } from "@/lib/server/http";
import { assertCan, Invalid } from "@/lib/server/policy";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => json({ log: await hl7Log(user, id) }));

export const POST = authed<{ id: string }>(async (_req, user, { id }) => {
  assertCan(user, "clinical.edit");
  const r = await sendNoteHl7(user, id, { manual: true });
  if (!r) throw new Invalid("The HL7 interface is not configured");
  return json(r);
});
