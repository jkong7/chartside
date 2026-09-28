import { authed, body, json } from "@/lib/server/http";
import { Invalid } from "@/lib/server/policy";
import { cosignNote, returnNote } from "@/lib/server/signoff";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ action?: "cosign" | "return"; attestation?: string; comment?: string }>(req);
  if (b.action === "return") return json({ cosign: await returnNote(user, id, b.comment ?? "") });
  if (b.action !== "cosign") throw new Invalid("Unknown action");
  return json({ cosign: await cosignNote(user, id, b) });
});
