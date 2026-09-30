import { captureTz } from "@/lib/server/tz";
import { currentUser, publicUser, startSession } from "@/lib/server/auth";
import { createGuest, purgeGuests } from "@/lib/server/guest";
import { json } from "@/lib/server/http";
import { clientIp, limited, tooMany } from "@/lib/server/ratelimit";

export async function POST(req: Request) {
  await purgeGuests();
  const current = await currentUser();
  if (current) return json({ user: publicUser(current), guest: !!current.guestUntil });
  if (limited(`try:${clientIp(req)}`, Number(process.env.CHARTSIDE_GUEST_RATE ?? 20), 3600000)) return tooMany();
  const guest = await captureTz(await createGuest());
  await startSession(guest.id, guest.orgId, 1);
  return json({ user: publicUser(guest), guest: true }, 201);
}
