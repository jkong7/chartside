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

export async function lineRoster(orgId: string) {
  const rows = await all<{ id: string; name: string; role: string; phone: string | null; verified: string | null; pin: string | null; last_call: string | null; calls: number }>(
    `SELECT u.id, u.name, m.role, u.phone, u.phone_verified_at AS verified, u.phone_pin_hash AS pin,
      (SELECT MAX(a.created_at) FROM audit a WHERE a.user_id = u.id AND a.action IN ('phone.call', 'phone.sim_call')) AS last_call,
      (SELECT COUNT(*) FROM audit a WHERE a.user_id = u.id AND a.action IN ('phone.call', 'phone.sim_call')) AS calls
    FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND m.status = 'active' AND m.role IN ('owner', 'admin', 'clinician', 'nurse', 'scribe') ORDER BY u.name`,
    orgId,
  );
  return rows.map((r) => ({
    userId: r.id,
    name: r.name,
    role: r.role,
    phone: r.verified && r.phone ? r.phone.replace(/\d(?=\d{4})/g, "•") : null,
    pin: !!r.pin,
    calls: Number(r.calls ?? 0),
    lastCall: r.last_call,
    ready: !!r.verified && !!r.pin,
  }));
}

export async function lineCallLog(orgId: string | null, limit = 25) {
  const calls = await all<{ user_id: string | null; detail: string; created_at: string; name: string | null }>(
    `SELECT a.user_id, a.detail, a.created_at, u.name FROM audit a LEFT JOIN users u ON u.id = a.user_id WHERE a.action IN ('phone.call', 'phone.sim_call') ${orgId ? "AND a.org_id = ?" : ""} ORDER BY a.created_at DESC LIMIT ?`,
    ...(orgId ? [orgId, limit] : [limit]),
  );
  const out = [];
  for (const c of calls) {
    const d = JSON.parse(c.detail || "{}") as { callSid?: string; guest?: boolean };
    const sid = d.callSid ?? "";
    const like = `%"callSid":"${sid.replace(/[%_"]/g, "")}"%`;
    const consent = sid ? await all<{ encounter_id: string | null; detail: string }>("SELECT encounter_id, detail FROM audit WHERE action = 'phone.consent' AND detail LIKE ? LIMIT 1", like) : [];
    const declined = sid ? await all<{ n: number }>("SELECT COUNT(*) AS n FROM audit WHERE action = 'phone.consent_declined' AND detail LIKE ?", like) : [];
    const encId = consent[0]?.encounter_id ?? null;
    const events = encId ? (await all<{ action: string }>("SELECT action FROM audit WHERE encounter_id = ?", encId)).map((e) => e.action) : [];
    const verifiedBy = consent[0] ? ((JSON.parse(consent[0].detail || "{}") as { verifiedBy?: string }).verifiedBy ?? null) : d.guest ? "guest" : null;
    const outcome = Number(declined[0]?.n ?? 0) ? "declined" : !encId ? (events.length ? "recorded" : "no visit") : events.includes("capture.discarded") ? "deleted" : events.includes("phone.ready_to_sign") ? "marked ready" : events.includes("capture.drafted") || events.includes("note.generated") ? "note drafted" : events.includes("capture.recovered") ? "recovered after drop" : "recorded";
    out.push({
      at: c.created_at,
      caller: d.guest ? "First-time caller" : c.name ?? "Unknown",
      simulator: sid.startsWith("CAsim"),
      verifiedBy,
      outcome,
      texted: events.includes("phone.texted"),
      summaryQueued: events.includes("phone.summary_queued"),
    });
  }
  return out;
}

export async function speechCheck() {
  const { synthesize, LiveListener, phoneSpeechReady } = await import("./speech");
  if (!phoneSpeechReady()) return { ok: false, tts: null, listen: null, error: "DEEPGRAM_API_KEY isn't set" };
  const t0 = Date.now();
  let tts: { ms: number; bytes: number } | null = null;
  try {
    const audio = await synthesize(`Chartside speech check ${Date.now() % 1000}.`);
    tts = { ms: Date.now() - t0, bytes: audio.length };
  } catch (err) {
    return { ok: false, tts: null, listen: null, error: err instanceof Error ? err.message : "Speech synthesis failed" };
  }
  const t1 = Date.now();
  const listen = await new Promise<{ ms: number } | { error: string }>((resolve) => {
    let done = false;
    const l = new LiveListener(
      () => {},
      (err) => {
        if (done) return;
        done = true;
        resolve({ error: err.message });
      },
      "check",
    );
    l.onOpen = () => {
      if (done) return;
      done = true;
      l.close();
      resolve({ ms: Date.now() - t1 });
    };
    l.open();
    setTimeout(() => {
      if (done) return;
      done = true;
      l.close();
      resolve({ error: "Live transcription didn't connect within 8 seconds" });
    }, 8000);
  });
  return { ok: !("error" in listen), tts, listen: "ms" in listen ? listen : null, error: "error" in listen ? listen.error : null };
}
