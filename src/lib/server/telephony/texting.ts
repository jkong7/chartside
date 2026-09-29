import { all, get } from "../../db";
import { decisionCounts } from "../decisions";
import { mintLoginLink, userByPhone } from "../magic";
import { normalizePhone } from "../notify";
import { actorFor, audit, encounters, users, type User } from "../repo";
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

const HELP = "Reply STATUS for what's waiting, SCHEDULE for today, LINK to open your stack, NUDGE 5 or BRIEF 7 for daily texts, or call this number before a visit to scribe it. Texts never include patient details.";

function dayBounds(at: Date, tz: string) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(at);
  const offsetMin = (() => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(parts);
    return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
  })();
  const start = new Date(Date.parse(`${day}T00:00:00Z`) - offsetMin * 60_000);
  return { from: start.toISOString(), to: new Date(start.getTime() + 86400_000).toISOString() };
}

export async function dayLine(u: User, at = new Date()) {
  const tz = process.env.CHARTSIDE_TZ || "America/Chicago";
  const { from, to } = dayBounds(at, tz);
  const list = (await encounters.list(u, { from, to, clinicianId: u.id, outpatient: true })).filter((e) => e.status !== "signed");
  if (!list.length) return { count: 0, text: "No visits on your schedule today." };
  const first = list.map((e) => e.scheduledAt).sort()[0];
  const upcoming = list.filter((e) => Date.parse(e.scheduledAt) >= at.getTime()).length;
  const t = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(first));
  return { count: list.length, text: `${list.length} visit${list.length === 1 ? "" : "s"} today, starting at ${t}${upcoming < list.length ? `, ${upcoming} still ahead` : ""}.` };
}

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
    await users.update(user.id, { prefs: { ...user.prefs, textOptOut: true, clinicNudgeHour: null, morningBriefHour: null } });
    return say("You won't get texts from Chartside. Reply START to turn them back on.");
  }
  if (/^(start|unstop|yes)$/.test(body)) {
    await users.update(user.id, { prefs: { ...user.prefs, textOptOut: false } });
    return say("Texts are back on. Reply HELP for commands.");
  }
  if (/^(help|info|\?|commands)$/.test(body)) return say(HELP);
  if (/^(link|stack|open|sign)$/.test(body)) return say(`Your stack: ${await link(user)}`);
  if (/^(schedule|today|day|my day)$/.test(body)) {
    const d = await dayLine(user);
    return say(`Chartside: ${d.text}${d.count ? ` Call the line and enter your PIN to hear them, or open: ${(await mintLoginLink(user.id, "/today", 30)).url}` : ""}`);
  }
  if (/^(brief|morning)\b/.test(body)) {
    const m = /\b(\d{1,2})(?::\d{2})?\s*(am|pm)?\b/.exec(body);
    let hour = m ? Number(m[1]) : 7;
    if (m?.[2] === "pm" && hour < 12) hour += 12;
    hour = Math.min(11, Math.max(5, hour));
    await users.update(user.id, { prefs: { ...user.prefs, morningBriefHour: hour, textOptOut: false } });
    return say(`Got it. On clinic days I'll text you a count of your visits at ${hour} AM. Reply STOP any time.`);
  }
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
  const briefs: string[] = [];
  for (const r of rows) {
    const prefs = JSON.parse(r.prefs || "{}") as { clinicNudgeHour?: number | null; morningBriefHour?: number | null; textOptOut?: boolean };
    if (!prefs.textOptOut && prefs.morningBriefHour != null && prefs.morningBriefHour === hour) {
      const had = await get<{ n: number }>("SELECT COUNT(*) AS n FROM audit WHERE user_id = ? AND action = 'text.brief' AND created_at >= ?", r.id, new Date(at.getTime() - 20 * 3600_000).toISOString());
      const bu = Number(had?.n ?? 0) === 0 ? await actorFor(r.id) : undefined;
      if (bu) {
        const d = await dayLine(bu, at);
        if (d.count) {
          try {
            await sendText(r.phone, `Chartside: ${d.text} Call the line before each visit. Reply STOP to end these.`, "morning_brief");
            await audit.log(bu, null, "text.brief", { day, count: d.count });
            briefs.push(r.id);
          } catch (err) {
            await audit.log(bu, null, "text.brief_failed", { error: err instanceof Error ? err.message.slice(0, 120) : "error" });
          }
        }
      }
    }
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
  return { hour, day, sent: sent.length, briefs: briefs.length };
}
