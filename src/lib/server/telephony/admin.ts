import { all } from "../../db";
import { normalizePhone } from "../notify";
import { Invalid } from "../policy";
import { audit, type User } from "../repo";
import { phoneSpeechReady } from "./speech";

function twilioBase() {
  return (process.env.TWILIO_BASE_URL || "https://api.twilio.com").replace(/\/$/, "");
}

function auth() {
  return `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`;
}

export function lineConfig() {
  const publicUrl = (process.env.CHARTSIDE_PUBLIC_URL || "").replace(/\/$/, "");
  return {
    number: process.env.CHARTSIDE_LINE_NUMBER || null,
    publicUrl: publicUrl || null,
    voiceUrl: publicUrl ? `${publicUrl}/api/voice/incoming` : null,
    smsUrl: publicUrl ? `${publicUrl}/api/sms/incoming` : null,
    checks: {
      speech: phoneSpeechReady(),
      twilio: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      publicUrl: /^https:\/\//.test(publicUrl) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(publicUrl),
      notes: !!process.env.ANTHROPIC_API_KEY,
      cron: !!process.env.CHARTSIDE_CRON_SECRET,
    },
  };
}

export async function connectNumber(actor: User, numberIn: string) {
  const cfg = lineConfig();
  if (!cfg.checks.twilio) throw new Invalid("Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN first");
  if (!cfg.voiceUrl || !cfg.smsUrl || !cfg.checks.publicUrl) throw new Invalid("Set CHARTSIDE_PUBLIC_URL to this deployment's https address first");
  const number = normalizePhone(numberIn ?? "");
  if (!number) throw new Invalid("Enter the Twilio number in full, like +13125550199");
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const found = await fetch(`${twilioBase()}/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(number)}`, { headers: { authorization: auth() }, signal: AbortSignal.timeout(10000) });
  if (!found.ok) throw new Invalid(`Twilio refused the lookup (${found.status})`);
  const list = ((await found.json()) as { incoming_phone_numbers?: { sid: string; phone_number: string }[] }).incoming_phone_numbers ?? [];
  const pn = list.find((x) => x.phone_number === number);
  if (!pn) throw new Invalid("That number isn't on this Twilio account");
  const upd = await fetch(`${twilioBase()}/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers/${pn.sid}.json`, {
    method: "POST",
    headers: { authorization: auth(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ VoiceUrl: cfg.voiceUrl, VoiceMethod: "POST", SmsUrl: cfg.smsUrl, SmsMethod: "POST", FriendlyName: "Chartside Line" }).toString(),
    signal: AbortSignal.timeout(10000),
  });
  if (!upd.ok) throw new Invalid(`Twilio refused the update (${upd.status})`);
  await audit.log(actor, null, "line.connected", { number: number.replace(/\d(?=\d{4})/g, "•"), phoneSid: pn.sid });
  return { number, phoneSid: pn.sid, voiceUrl: cfg.voiceUrl, smsUrl: cfg.smsUrl };
}

export async function lineStats(orgId: string | null, days = 7) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const where = orgId ? "AND org_id = ?" : "";
  const args = orgId ? [since, orgId] : [since];
  const rows = await all<{ action: string; n: number }>(`SELECT action, COUNT(*) AS n FROM audit WHERE created_at >= ? ${where} AND (action LIKE 'phone.%' OR action LIKE 'text.%' OR action = 'capture.drafted' OR action = 'capture.failed') GROUP BY action`, ...args);
  const n = (a: string) => Number(rows.find((r) => r.action === a)?.n ?? 0);
  const origins = await all<{ content: string }>(`SELECT a.content FROM artifacts a JOIN encounters e ON e.id = a.encounter_id WHERE a.kind = 'capture_origin' AND a.created_at >= ? ${orgId ? "AND e.org_id = ?" : ""}`, ...args);
  const byChannel: Record<string, number> = {};
  for (const o of origins) {
    let ch = "unknown";
    try {
      ch = (JSON.parse(o.content) as { channel?: string }).channel ?? "unknown";
    } catch {
      ch = "unknown";
    }
    byChannel[ch] = (byChannel[ch] ?? 0) + 1;
  }
  return {
    days,
    calls: n("phone.call") + n("phone.sim_call"),
    simCalls: n("phone.sim_call"),
    consented: n("phone.consent"),
    declined: n("phone.consent_declined"),
    readyOnCall: n("phone.ready_to_sign"),
    texted: n("phone.texted"),
    agentTurns: n("phone.agent_turn"),
    textReplies: n("text.reply"),
    nudges: n("text.nudge"),
    drafted: n("capture.drafted"),
    failed: n("capture.failed"),
    byChannel,
  };
}
