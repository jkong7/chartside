import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import { seal } from "@/lib/fhir/crypto";
import { guestForPhone } from "@/lib/server/guest";
import { audit } from "@/lib/server/repo";
import { clearSim } from "@/lib/server/telephony/sms";
import { phoneSpeechReady } from "@/lib/server/telephony/speech";
import { mintCallToken } from "@/lib/server/telephony/token";

export async function POST(req: Request) {
  if (!phoneSpeechReady()) return NextResponse.json({ error: "The phone line needs DEEPGRAM_API_KEY" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { phone?: string };
  const me = await currentUser().catch(() => null);
  const prior = typeof body.phone === "string" && /^\+1555\d{7}$/.test(body.phone) ? body.phone : null;
  const phone = prior ?? `+1555${String(randomInt(0, 10_000_000)).padStart(7, "0")}`;
  const user = me ?? (await guestForPhone(phone));
  const callSid = `CAsim${randomInt(0, 2 ** 47).toString(16)}${Date.now().toString(16)}`;
  const callToken = mintCallToken({ userId: user.id, orgId: user.orgId, phone, callSid, guest: !!user.guestUntil, sim: true }, 300);
  if (!prior) clearSim(phone);
  await audit.log(user, null, "phone.sim_call", { callSid, guest: !!user.guestUntil });
  return NextResponse.json({ callSid, callToken, phone, inboxKey: seal(JSON.stringify({ phone, exp: Date.now() + 6 * 3600_000 })), streamPath: "/api/voice/stream", signedIn: !!me });
}
