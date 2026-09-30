import { body, json } from "@/lib/server/http";
import { offerLink, visitRoute, withdrawOffer } from "@/lib/server/patientVisit";

export const POST = visitRoute(async (req, v) => json(await offerLink(v, new URL(req.url).origin, (await body<{ clinicianName?: string }>(req)).clinicianName), 201));

export const DELETE = visitRoute(async (_req, v) => {
  await withdrawOffer(v);
  return json({ ok: true });
});
