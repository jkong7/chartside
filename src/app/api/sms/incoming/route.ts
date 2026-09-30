import { inboundSms } from "@/lib/server/telephony/texting";
import { publicOrigin, twiml, validSignature } from "@/lib/server/telephony/twilio";

export async function POST(req: Request) {
  const params = Object.fromEntries(new URLSearchParams(await req.text()));
  const origin = publicOrigin(req.url, req.headers);
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return new Response("Text webhooks need TWILIO_AUTH_TOKEN", { status: 503 });
  const u = new URL(req.url);
  if (!validSignature(token, `${origin}${u.pathname}${u.search}`, params, req.headers.get("x-twilio-signature"))) return new Response("Invalid signature", { status: 403 });
  const reply = await inboundSms(params, origin);
  return new Response(twiml([{ message: reply }]), { headers: { "content-type": "text/xml; charset=utf-8" } });
}
