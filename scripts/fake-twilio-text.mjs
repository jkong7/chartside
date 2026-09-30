import { twilioSignature } from "../tests/e2e/fake-twilio.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, "").split("=");
  return [k, v.join("=") || "1"];
}));

const base = (args.base || "http://localhost:3100").replace(/\/$/, "");
const token = process.env.TWILIO_AUTH_TOKEN;
if (!token) {
  console.error("Set TWILIO_AUTH_TOKEN to the server's token");
  process.exit(1);
}
const wa = !!args.whatsapp;
const from = args.from || "+15550100000";
const path = wa ? "/api/whatsapp/incoming" : "/api/sms/incoming";
const params = { From: wa ? `whatsapp:${from}` : from, To: wa ? "whatsapp:+13125550199" : "+13125550199", Body: args.body || "", MessageSid: `MM${Date.now()}`, NumMedia: args.media ? "1" : "0" };
if (args.media) {
  params.MediaUrl0 = args.media;
  params.MediaContentType0 = args.type || (wa ? "audio/ogg" : "audio/wav");
}
if (wa) params.WaId = from.slice(1);
const url = `${base}${path}`;
const res = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSignature(token, url, params) }, body: new URLSearchParams(params).toString() });
const xml = await res.text();
console.log(res.status, (/<Message>([\s\S]*)<\/Message>/.exec(xml)?.[1] ?? xml).replace(/&amp;/g, "&").replace(/&apos;/g, "'"));
