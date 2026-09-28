import { admitFromEd, assignBed, depart, pickUp, setDisposition } from "@/lib/server/ed";
import { authed, body, json } from "@/lib/server/http";
import { Invalid } from "@/lib/server/policy";

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const b = await body<{ action?: string; bed?: string; disposition?: string; unit?: string; room?: string; attendingId?: string }>(req);
  switch (b.action) {
    case "bed":
      return json({ visit: await assignBed(user, id, b.bed ?? "") });
    case "pickup":
      return json({ encounterId: await pickUp(user, id) });
    case "disposition":
      return json({ visit: await setDisposition(user, id, b.disposition ?? "") });
    case "admit":
      return json(await admitFromEd(user, id, b), 201);
    case "depart":
      return json({ visit: await depart(user, id) });
    case "lwbs":
      return json({ visit: await depart(user, id, true) });
    default:
      throw new Invalid("Unknown action");
  }
});
