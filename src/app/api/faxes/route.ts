import { discardFax, faxInbox, fileFax } from "@/lib/server/faxin";
import { authed, body, json } from "@/lib/server/http";

export const GET = authed(async (_req, user) => json({ faxes: await faxInbox(user) }));

export const POST = authed(async (req, user) => {
  const b = await body<{ id?: string; patientId?: string; action?: string }>(req);
  if (b.action === "discard") await discardFax(user, b.id ?? "");
  else await fileFax(user, b.id ?? "", b.patientId ?? "");
  return json({ faxes: await faxInbox(user) });
});
