import { authed, fail } from "@/lib/server/http";
import { ics } from "@/lib/server/schedule";
import { encounters } from "@/lib/server/repo";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const e = await encounters.get(user, id);
  if (!e) return fail("Encounter not found", 404);
  return new Response(ics(e, user.orgName, e.clinicianName ?? user.name), { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="appointment-${e.scheduledAt.slice(0, 10)}.ics"` } });
});
