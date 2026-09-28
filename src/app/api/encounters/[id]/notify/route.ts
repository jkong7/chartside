import { authed, body, json } from "@/lib/server/http";
import { notifyForEncounter, type Channel, type NoticeKind } from "@/lib/server/notify";
import { Invalid } from "@/lib/server/policy";
import { artifacts, encounters } from "@/lib/server/repo";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ kind?: NoticeKind; channel?: Channel }>(req);
  const enc = await encounters.get(user, id);
  if (!enc) throw new Error("Encounter not found");
  const origin = new URL(req.url).origin;
  let path: string | null = null;
  if (b.kind === "summary") path = (await artifacts.get<{ token: string }>(enc.id, "share"))?.token ? `/s/${(await artifacts.get<{ token: string }>(enc.id, "share"))!.token}` : null;
  else if (b.kind === "intake") path = (await artifacts.get<{ token: string }>(enc.id, "intake"))?.token ? `/intake/${(await artifacts.get<{ token: string }>(enc.id, "intake"))!.token}` : null;
  else throw new Invalid("Choose what to send");
  if (!path) throw new Invalid(b.kind === "summary" ? "Create the patient link first" : "Create the intake link first");
  return json(await notifyForEncounter(user, enc.id, b.kind, `${origin}${path}`, b.channel), 201);
});
