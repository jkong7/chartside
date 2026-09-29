import { currentUser, publicUser, startSession } from "@/lib/server/auth";
import { createGuest, purgeGuests } from "@/lib/server/guest";
import { json } from "@/lib/server/http";

export async function POST() {
  await purgeGuests();
  const current = await currentUser();
  if (current) return json({ user: publicUser(current), guest: !!current.guestUntil });
  const guest = await createGuest();
  await startSession(guest.id, guest.orgId, 1);
  return json({ user: publicUser(guest), guest: true }, 201);
}
