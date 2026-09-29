import { all, get } from "../../db";
import { decisionCounts } from "../decisions";
import { mintLoginLink, userByPhone } from "../magic";
import { normalizePhone } from "../notify";
import { actorFor, audit, users, type User } from "../repo";
import { sendText } from "./sms";

const KIND_WORDS: Record<string, [string, string]> = {
  "note.sign": ["note to sign", "notes to sign"],
  "note.cosign": ["co-signature", "co-signatures"],
  "coding.query": ["coding question", "coding questions"],
  "message.reply": ["patient message", "patient messages"],
  "patient.match": ["visit to match", "visits to match"],
  "task.review": ["task", "tasks"],
  "claim.exception": ["claim to fix", "claims to fix"],
  proposal: ["suggested change", "suggested changes"],
};

export function queueLine(counts: { total: number; urgent: number; byKind: Partial<Record<string, number>> }) {
  if (!counts.total) return "Your stack is clear. Nothing is waiting on you.";
  const parts = Object.entries(counts.byKind)
    .filter(([, n]) => n)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([k, n]) => `${n} ${(KIND_WORDS[k] ?? ["item", "items"])[n === 1 ? 0 : 1]}`);
  const minutes = Math.max(1, Math.round(counts.total * 1.2));
  const urgent = counts.urgent ? ` ${counts.urgent} marked urgent.` : "";
  return `${parts.join(", ")}.${urgent} About ${minutes} min to clear.`;
}

async function link(u: User, path = "/go/stack") {
  return (await mintLoginLink(u.id, path, 30)).url;
}

const HELP = "Reply STATUS for what's waiting, LINK to open your stack, or call this number before a visit to scribe it. Texts never include patient details.";

export async function inboundText(fromRaw: string, bodyRaw: string, origin: string): Promise<string> {
  const from = normalizePhone(fromRaw ?? "");
  const body = (bodyRaw ?? "").trim().toLowerCase();
  if (!from) return "Chartside couldn't read your number.";
  const user = await userByPhone(from);
  if (!user) {
    return `Chartside is an AI scribe you can call. Call this number before your next visit, set the phone down, and your note is texted to you when you hang up. First note free: ${origin}/line?src=text`;
  }
  const say = async (text: string) => {
    await audit.log(user, null, "text.reply", { command: body.split(/\s+/)[0]?.slice(0, 12) ?? "" });
    return text;
  };
  if (/^(stop|stopall|unsubscribe|cancel|end|quit)$/.test(body)) {
    await users.update(user.id, { prefs: { ...user.prefs, textOptOut: true, clinicNudgeHour: null } });
    return say("You won't get texts from Chartside. Reply START to turn them back on.");
  }
  if (/^(start|unstop|yes)$/.test(body)) {
    await users.update(user.id, { prefs: { ...user.prefs, textOptOut: false } });
    return say("Texts are back on. Reply HELP for commands.");
  }
  if (/^(help|info|\?|commands)$/.test(body)) return say(HELP);
  if (/^(link|stack|open|sign)$/.test(body)) return say(`Your stack: ${await link(user)}`);
  if (/^(status|queue|what'?s waiting|s)$/.test(body) || !body) {
    const c = await decisionCounts(user);
    return say(`Chartside: ${queueLine(c)}${c.total ? ` Open: ${await link(user)}` : ""}`);
  }
  if (/^(nudge|remind)\b/.test(body)) {
    const m = /\b(\d{1,2})(?::\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?(?!\s*(min|minute|hour|hr))\b/.exec(body);
    let hour = 17;
    if (m) {
      const h = Number(m[1]);
      const suffix = m[2]?.replace(/\./g, "");
      hour = suffix === "am" ? h % 12 : h < 12 ? h + 12 : h;
    }
    hour = Math.min(20, Math.max(12, hour));
    await users.update(user.id, { prefs: { ...user.prefs, clinicNudgeHour: hour, textOptOut: false } });
    return say(`Got it. If anything is waiting, I'll text you at ${hour > 12 ? hour - 12 : hour}${hour >= 12 ? " PM" : " AM"}. Reply STOP any time.`);
  }
  return say(`I can't read or send patient details by text. ${HELP} Open your stack: ${await link(user)}`);
}

function localHour(at: Date, tz: string) {
  return Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(at));
}

function localDay(at: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(at);
}

export async function sendClinicNudges(at = new Date()) {
  const tz = process.env.CHARTSIDE_TZ || "America/Chicago";
  const hour = localHour(at, tz);
  const day = localDay(at, tz);
  const rows = await all<{ id: string; phone: string; prefs: string }>("SELECT id, phone, prefs FROM users WHERE phone IS NOT NULL AND phone_verified_at IS NOT NULL");
  const sent: string[] = [];
  for (const r of rows) {
    const prefs = JSON.parse(r.prefs || "{}") as { clinicNudgeHour?: number | null; textOptOut?: boolean };
    if (prefs.textOptOut || prefs.clinicNudgeHour == null || prefs.clinicNudgeHour !== hour) continue;
    const already = await get<{ n: number }>("SELECT COUNT(*) AS n FROM audit WHERE user_id = ? AND action = 'text.nudge' AND created_at >= ?", r.id, new Date(at.getTime() - 20 * 3600_000).toISOString());
    if (Number(already?.n ?? 0) > 0) continue;
    const u = await actorFor(r.id);
    if (!u) continue;
    const c = await decisionCounts(u);
    if (!c.total) continue;
    try {
      await sendText(r.phone, `Chartside: ${queueLine(c)} Clear it before you leave: ${await link(u)} Reply STOP to end these.`, "clinic_nudge");
      await audit.log(u, null, "text.nudge", { day, total: c.total });
      sent.push(r.id);
    } catch (err) {
      await audit.log(u, null, "text.nudge_failed", { error: err instanceof Error ? err.message.slice(0, 120) : "error" });
    }
  }
  return { hour, day, sent: sent.length };
}
