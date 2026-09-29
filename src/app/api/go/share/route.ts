import { cookies } from "next/headers";
import { currentUser, startSession } from "@/lib/server/auth";
import { captureAudio } from "@/lib/server/capture";
import { createGuest } from "@/lib/server/guest";
import { body, fail, json } from "@/lib/server/http";
import { dropShared, SHARE_COOKIE, takeShared } from "@/lib/server/sharedAudio";

export async function POST(req: Request) {
  const b = await body<{ id?: string; consent?: boolean }>(req);
  const secret = (await cookies()).get(SHARE_COOKIE)?.value;
  if (!b.id) return fail("Missing upload", 400);
  if (!b.consent) {
    dropShared(b.id, secret);
    return json({ discarded: true });
  }
  const h = takeShared(b.id, secret);
  if (!h) return fail("This upload expired. Share the recording again.", 410);
  let user = await currentUser().catch(() => null);
  let guest = false;
  if (!user) {
    user = await createGuest();
    await startSession(user.id, user.orgId, 1);
    guest = true;
  }
  const r = await captureAudio(user, { bytes: h.bytes, mime: h.mime, options: { consent: "granted", method: "verbal", state: user.prefs.state || "IL", channel: "android-share", reason: "" } });
  return json({ ...r, guest }, 202);
}
