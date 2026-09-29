import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import { cookies } from "next/headers";
import { seal, unseal } from "@/lib/fhir/crypto";
import { guestForPhone } from "@/lib/server/guest";
import { clientIp, limited, tooMany } from "@/lib/server/ratelimit";
import { audit } from "@/lib/server/repo";
import { clearSim } from "@/lib/server/telephony/sms";
import { phoneSpeechReady } from "@/lib/server/telephony/speech";
import { mintCallToken } from "@/lib/server/telephony/token";

export async function POST(req: Request) {
  if (!phoneSpeechReady()) return NextResponse.json({ error: "The phone line needs DEEPGRAM_API_KEY" }, { status: 503 });
  const perIp = Number(process.env.CHARTSIDE_SIM_RATE || 12);
  const perDay = Number(process.env.CHARTSIDE_SIM_DAILY_CAP || 300);
  if (limited(`sim:${clientIp(req)}`, perIp, 3600_000) || limited("sim:all", perDay, 86400_000)) return tooMany();
  const me = await currentUser().catch(() => null);
  let prior: string | null = null;
  try {
    const c = JSON.parse(unseal((await cookies()).get("cs_sim")?.value ?? "")) as { phone?: string; exp?: number };
    if (c.phone && /^\+1555\d{7}$/.test(c.phone) && (c.exp ?? 0) > Date.now()) prior = c.phone;
  } catch {
    prior = null;
  }
  const phone = prior ?? `+1555${String(randomInt(0, 10_000_000)).padStart(7, "0")}`;
  const user = me ?? (await guestForPhone(phone));
  const callSid = `CAsim${randomInt(0, 2 ** 47).toString(16)}${Date.now().toString(16)}`;
  const callToken = mintCallToken({ userId: user.id, orgId: user.orgId, phone, callSid, guest: !!user.guestUntil, sim: true }, 300);
  if (!prior) clearSim(phone);
  await audit.log(user, null, "phone.sim_call", { callSid, guest: !!user.guestUntil });
  const res = NextResponse.json({ callSid, callToken, phone, inboxKey: seal(JSON.stringify({ phone, exp: Date.now() + 6 * 3600_000 })), streamPath: "/api/voice/stream", signedIn: !!me });
  res.cookies.set("cs_sim", seal(JSON.stringify({ phone, exp: Date.now() + 6 * 3600_000 })), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.CHARTSIDE_INSECURE_COOKIES !== "1", path: "/api/voice/sim", maxAge: 6 * 3600 });
  return res;
}
