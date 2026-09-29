import { createHash } from "node:crypto";
import { all, get, now, run, uid } from "../db";

export const LOOP_COOKIE = "cs_loop";
export const VISITOR_COOKIE = "cs_vid";
export const LOOPS = ["referral", "share", "receipt", "invite", "recap", "line", "phone_guest", "go_guest", "direct"] as const;
export type LoopId = (typeof LOOPS)[number];
export type LoopKind = "exposure" | "click" | "signup" | "activation";
export const ACTIVATION_NOTES = 3;
export const ACTIVATION_DAYS = 7;

const DEDUPE_MS = 24 * 3600000;

export function loopId(v: string | null | undefined): LoopId {
  return (LOOPS as readonly string[]).includes(v ?? "") ? (v as LoopId) : "direct";
}

export function visitorKey(raw: string | null | undefined) {
  return raw ? createHash("sha256").update(`loop:${raw}`).digest("hex").slice(0, 24) : null;
}

async function orgOf(userId: string | null | undefined) {
  if (!userId) return null;
  return (await get<{ org_id: string }>("SELECT org_id FROM memberships WHERE user_id = ? AND status = 'active' ORDER BY created_at LIMIT 1", userId))?.org_id ?? null;
}

export async function trackLoop(e: { loop: string; kind: LoopKind; inviterId?: string | null; userId?: string | null; visitor?: string | null }) {
  const loop = loopId(e.loop);
  const visitor = e.visitor ?? null;
  if (visitor && (e.kind === "exposure" || e.kind === "click")) {
    const seen = await get<{ id: string }>("SELECT id FROM loop_events WHERE loop_id = ? AND kind = ? AND visitor = ? AND COALESCE(inviter_id, '') = ? AND at > ?", loop, e.kind, visitor, e.inviterId ?? "", new Date(Date.now() - DEDUPE_MS).toISOString());
    if (seen) return false;
  }
  if (e.userId && (e.kind === "signup" || e.kind === "activation")) {
    const dup = await get<{ id: string }>("SELECT id FROM loop_events WHERE kind = ? AND user_id = ?", e.kind, e.userId);
    if (dup) return false;
  }
  await run("INSERT INTO loop_events (id, loop_id, kind, inviter_id, user_id, org_id, visitor, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", uid("lev_"), loop, e.kind, e.inviterId ?? null, e.userId ?? null, (await orgOf(e.inviterId)) ?? (await orgOf(e.userId)), visitor, now());
  return true;
}

export function encodeLoopCookie(loop: LoopId, inviterId: string | null) {
  return `${loop}.${inviterId ?? ""}`;
}

export function decodeLoopCookie(v: string | null | undefined): { loop: LoopId; inviterId: string | null } | null {
  if (!v) return null;
  const [l, i] = v.split(".");
  const loop = loopId(l);
  return loop === "direct" && l !== "direct" ? null : { loop, inviterId: i && /^usr_[a-z0-9]+$/i.test(i) ? i : null };
}

export async function recordSignup(userId: string, touch: { loop: LoopId; inviterId: string | null } | null) {
  const cur = await get<{ acq_loop: string | null; acq_inviter: string | null }>("SELECT acq_loop, acq_inviter FROM users WHERE id = ?", userId);
  if (!cur) return null;
  const loop = cur.acq_loop ? loopId(cur.acq_loop) : touch?.loop ?? "direct";
  const inviter = cur.acq_loop ? cur.acq_inviter : touch?.inviterId ?? null;
  if (!cur.acq_loop) await run("UPDATE users SET acq_loop = ?, acq_inviter = ? WHERE id = ?", loop, inviter === userId ? null : inviter, userId);
  await trackLoop({ loop, kind: "signup", inviterId: inviter === userId ? null : inviter, userId });
  return loop;
}

export async function markGuestLoop(userId: string, loop: "phone_guest" | "go_guest") {
  await run("UPDATE users SET acq_loop = ? WHERE id = ? AND acq_loop IS NULL", loop, userId);
  await trackLoop({ loop, kind: "click", userId });
}

export async function checkActivation(userId: string) {
  const u = await get<{ created_at: string; acq_loop: string | null; acq_inviter: string | null; guest_expires_at: string | null }>("SELECT created_at, acq_loop, acq_inviter, guest_expires_at FROM users WHERE id = ?", userId);
  if (!u || u.guest_expires_at) return false;
  const until = new Date(new Date(u.created_at).getTime() + ACTIVATION_DAYS * 86400000).toISOString();
  const n = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM encounters WHERE user_id = ? AND status = 'signed' AND signed_at <= ?", userId, until))?.n ?? 0);
  if (n < ACTIVATION_NOTES) return false;
  return trackLoop({ loop: u.acq_loop ?? "direct", kind: "activation", inviterId: u.acq_inviter, userId });
}

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function isOperator(email: string) {
  return (process.env.CHARTSIDE_OPERATOR_EMAILS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

export async function loopMetrics(scope: { orgId: string | null }, opts: { days?: number; weeks?: number; at?: Date } = {}) {
  const at = opts.at ?? new Date();
  const days = opts.days ?? 28;
  const since = new Date(at.getTime() - days * 86400000).toISOString();
  const where = scope.orgId ? "AND org_id = ?" : "";
  const p = scope.orgId ? [scope.orgId] : [];
  const rows = await all<{ loop_id: string; kind: string; n: number }>(`SELECT loop_id, kind, COUNT(*) AS n FROM loop_events WHERE at >= ? AND at <= ? ${where} GROUP BY loop_id, kind`, since, at.toISOString(), ...p);
  const funnel = LOOPS.map((loop) => {
    const c = (k: string) => Number(rows.find((r) => r.loop_id === loop && r.kind === k)?.n ?? 0);
    return { loop, exposure: c("exposure"), click: c("click"), signup: c("signup"), activation: c("activation") };
  }).filter((f) => f.exposure + f.click + f.signup + f.activation > 0);

  const weeks = opts.weeks ?? 4;
  const k: { loop: string; week: string; inviters: number; signups: number; k: number | null }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = new Date(at.getTime() - w * 7 * 86400000);
    const start = new Date(end.getTime() - 7 * 86400000);
    const ev = await all<{ loop_id: string; kind: string; inviter_id: string | null }>(`SELECT loop_id, kind, inviter_id FROM loop_events WHERE at > ? AND at <= ? AND inviter_id IS NOT NULL ${where}`, start.toISOString(), end.toISOString(), ...p);
    for (const loop of new Set(ev.map((e) => e.loop_id))) {
      const mine = ev.filter((e) => e.loop_id === loop);
      const inviters = new Set(mine.map((e) => e.inviter_id)).size;
      const signups = mine.filter((e) => e.kind === "signup").length;
      k.push({ loop, week: start.toISOString().slice(0, 10), inviters, signups, k: inviters ? Math.round((signups / inviters) * 100) / 100 : null });
    }
  }

  const members = scope.orgId ? "AND u.id IN (SELECT user_id FROM memberships WHERE org_id = ?)" : "";
  const firsts = await all<{ id: string; created_at: string; first_capture: string | null; first_note: string | null }>(
    `SELECT u.id, u.created_at,
       (SELECT MIN(e.created_at) FROM encounters e WHERE e.user_id = u.id AND EXISTS (SELECT 1 FROM artifacts a WHERE a.encounter_id = e.id AND a.kind = 'capture_origin')) AS first_capture,
       (SELECT MIN(n.created_at) FROM notes n JOIN encounters e ON e.id = n.encounter_id WHERE e.user_id = u.id AND EXISTS (SELECT 1 FROM artifacts a WHERE a.encounter_id = e.id AND a.kind = 'capture_origin')) AS first_note
     FROM users u WHERE u.created_at >= ? AND u.guest_expires_at IS NULL ${members}`,
    since, ...p,
  );
  const ttfv = firsts.filter((f) => f.first_capture && f.first_note && f.first_note >= f.first_capture).map((f) => Math.round((new Date(f.first_note!).getTime() - new Date(f.first_capture!).getTime()) / 1000));
  const signups = firsts.length;
  const activated = Number((await get<{ n: number }>(`SELECT COUNT(*) AS n FROM loop_events le JOIN users u ON u.id = le.user_id WHERE le.kind = 'activation' AND u.created_at >= ? ${members}`, since, ...p))?.n ?? 0);
  return {
    windowDays: days,
    funnel,
    k,
    ttfv: { medianSeconds: median(ttfv), users: ttfv.length },
    activation: { signups, activated, rate: signups ? Math.round((activated / signups) * 1000) / 10 : null, rule: `${ACTIVATION_NOTES} signed notes within ${ACTIVATION_DAYS} days` },
  };
}

export async function touchFromCookies(jar: { get(name: string): { value: string } | undefined }) {
  const loop = decodeLoopCookie(jar.get(LOOP_COOKIE)?.value);
  if (loop) return loop;
  const code = jar.get("cs_ref")?.value;
  if (!code) return null;
  const r = await get<{ user_id: string }>("SELECT user_id FROM referral_codes WHERE code = ?", code);
  return r ? { loop: "referral" as LoopId, inviterId: r.user_id } : null;
}

export async function trackLineVisit(input: { src?: string | null; ref?: string | null; visitor?: string | null }) {
  const src = input.src ?? "";
  const r = input.ref && /^[a-z0-9]{6}$/.test(input.ref) ? await get<{ user_id: string }>("SELECT user_id FROM referral_codes WHERE code = ?", input.ref) : undefined;
  const loop: LoopId = src === "recap" ? "recap" : r ? loopId(src === "share" || src === "receipt" || src === "invite" ? src : "referral") : "line";
  if (r && loop !== "recap") return false;
  return trackLoop({ loop, kind: "click", inviterId: r?.user_id ?? null, visitor: visitorKey(input.visitor ?? null) });
}
