import webpush from "web-push";
import { all, now, run, uid } from "../db";
import { Invalid } from "./policy";
import { audit, type User } from "./repo";

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<{ statusCode: number }>;

let override: Sender | null = null;

export function setPushSender(fn: Sender | null) {
  override = fn;
}

export function pushConfigured() {
  return !!(process.env.CHARTSIDE_VAPID_PUBLIC && process.env.CHARTSIDE_VAPID_PRIVATE) || !!override;
}

export function pushPublicKey() {
  return process.env.CHARTSIDE_VAPID_PUBLIC || null;
}

function sender(): Sender {
  if (override) return override;
  webpush.setVapidDetails(process.env.CHARTSIDE_VAPID_SUBJECT || "mailto:security@chartside.invalid", process.env.CHARTSIDE_VAPID_PUBLIC!, process.env.CHARTSIDE_VAPID_PRIVATE!);
  return (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 3600, urgency: "normal" });
}

export async function subscribePush(u: User, sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }, userAgent: string | null) {
  if (u.guestUntil) throw new Invalid("Save your notes with your email first, then turn on notifications.");
  if (!sub.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new Invalid("That notification subscription isn't valid");
  await run("DELETE FROM push_subscriptions WHERE endpoint = ?", sub.endpoint);
  await run("INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", uid("psh_"), u.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth, (userAgent ?? "").slice(0, 200), now());
  await audit.log(u, null, "push.subscribed", {});
  return { ok: true };
}

export async function unsubscribePush(u: User, endpoint: string) {
  await run("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?", u.id, endpoint);
  return { ok: true };
}

export async function pushCount(userId: string) {
  return Number((await all<{ n: number }>("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?", userId))[0]?.n ?? 0);
}

const PHI_GUARD = /\b(diagnos|assessment|mg\b|hypertension|diabetes|cancer|depress|pregnan|MRN|DOB)/i;

export async function pushToUser(userId: string, payload: PushPayload) {
  if (!pushConfigured()) return { sent: 0 };
  if (PHI_GUARD.test(`${payload.title} ${payload.body}`)) throw new Error("Refusing to push something that looks like patient information");
  const subs = await all<{ id: string; endpoint: string; p256dh: string; auth: string }>("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?", userId);
  const send = sender();
  let sent = 0;
  for (const s of subs) {
    try {
      await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
      await run("UPDATE push_subscriptions SET last_sent_at = ? WHERE id = ?", now(), s.id);
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await run("DELETE FROM push_subscriptions WHERE id = ?", s.id);
    }
  }
  return { sent };
}
