import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { all, get, now, run, uid } from "../db";
import { seal, unseal } from "../fhir/crypto";
import { Forbidden, Invalid } from "./policy";
import { actorFor, audit, j, type User } from "./repo";

export const SCOPES = ["patients:read", "patients:write", "encounters:read", "encounters:write", "notes:generate", "claims:read"] as const;
export type Scope = (typeof SCOPES)[number];

export const EVENTS = ["note.generated", "note.signed", "claim.status_changed", "task.created", "message.received"] as const;
export type WebhookEvent = (typeof EVENTS)[number];

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  createdBy: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

function assertAdmin(u: User) {
  if (!["owner", "admin"].includes(u.role)) throw new Forbidden("Only owners and admins can manage API keys and webhooks");
}

export const apiKeys = {
  list: async (u: User): Promise<ApiKey[]> =>
    (await all<{ id: string; name: string; prefix: string; scopes: string; creator: string | null; created_at: string; last_used_at: string | null; revoked_at: string | null }>("SELECT k.*, us.name AS creator FROM api_keys k LEFT JOIN users us ON us.id = k.created_by WHERE k.org_id = ? ORDER BY k.created_at DESC", u.orgId)).map((r) => ({ id: r.id, name: r.name, prefix: r.prefix, scopes: j(r.scopes, []), createdBy: r.creator, createdAt: r.created_at, lastUsedAt: r.last_used_at, revokedAt: r.revoked_at })),
  create: async (u: User, input: { name?: string; scopes?: string[] }) => {
    assertAdmin(u);
    const name = (input.name ?? "").trim().slice(0, 60);
    if (!name) throw new Invalid("Name the key after the system that will use it");
    const scopes = (input.scopes ?? []).filter((s): s is Scope => (SCOPES as readonly string[]).includes(s));
    if (!scopes.length) throw new Invalid("Choose at least one scope");
    const prefix = randomBytes(4).toString("hex");
    const secret = randomBytes(24).toString("base64url");
    const token = `cs_live_${prefix}_${secret}`;
    const id = uid("key_");
    await run("INSERT INTO api_keys (id, org_id, name, prefix, hash, scopes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, u.orgId, name, prefix, hash(token), JSON.stringify(scopes), u.id, now());
    await audit.log(u, null, "api_key.created", { id, name, scopes });
    return { id, token };
  },
  revoke: async (u: User, id: string) => {
    assertAdmin(u);
    await run("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND org_id = ? AND revoked_at IS NULL", now(), id, u.orgId);
    await audit.log(u, null, "api_key.revoked", { id });
  },
};

const buckets = new Map<string, { tokens: number; at: number }>();
export const RATE = { perMinute: Number(process.env.CHARTSIDE_API_RATE ?? 120) };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function apiActor(req: Request, need: Scope): Promise<{ user: User; keyId: string }> {
  const m = /^Bearer\s+(cs_live_([a-f0-9]{8})_[A-Za-z0-9_-]{20,})$/.exec(req.headers.get("authorization") ?? "");
  if (!m) throw new ApiError(401, "Missing or malformed API key. Send Authorization: Bearer cs_live_…");
  const row = await get<{ id: string; org_id: string; hash: string; scopes: string; created_by: string; revoked_at: string | null }>("SELECT * FROM api_keys WHERE prefix = ?", m[2]);
  const ok = row && timingSafeEqual(Buffer.from(row.hash, "hex"), Buffer.from(hash(m[1]), "hex"));
  if (!row || !ok || row.revoked_at) throw new ApiError(401, "Invalid or revoked API key");
  const scopes = j<Scope[]>(row.scopes, []);
  if (!scopes.includes(need)) throw new ApiError(403, `This key lacks the ${need} scope`);
  const b = buckets.get(row.id) ?? { tokens: RATE.perMinute, at: Date.now() };
  const refill = ((Date.now() - b.at) / 60000) * RATE.perMinute;
  b.tokens = Math.min(RATE.perMinute, b.tokens + refill);
  b.at = Date.now();
  if (b.tokens < 1) throw new ApiError(429, "Rate limit exceeded; retry shortly");
  b.tokens -= 1;
  buckets.set(row.id, b);
  const user = await actorFor(row.created_by, row.org_id);
  if (!user || !["owner", "admin", "clinician"].includes(user.role)) throw new ApiError(403, "The key's creator no longer has access to this organization");
  await run("UPDATE api_keys SET last_used_at = ? WHERE id = ?", now(), row.id);
  return { user, keyId: row.id };
}

export function apiHandler<P = Record<string, never>>(need: Scope, fn: (req: Request, user: User, params: P) => Promise<unknown>) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try {
      const { user, keyId } = await apiActor(req, need);
      const data = await fn(req, user, (await ctx.params) ?? ({} as P));
      if (req.method !== "GET") await audit.log(user, null, "api.call", { keyId, method: req.method, path: new URL(req.url).pathname });
      return Response.json(data, { status: req.method === "POST" ? 201 : 200 });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : err instanceof Forbidden ? 403 : err instanceof Invalid ? 422 : err instanceof Error && /not found/i.test(err.message) ? 404 : 500;
      if (status === 500) console.error(err);
      return Response.json({ error: { status, message: err instanceof Error ? err.message : "Unexpected error" } }, { status, headers: status === 429 ? { "retry-after": "10" } : undefined });
    }
  };
}

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
}

export const webhooks = {
  list: async (u: User): Promise<Webhook[]> => (await all<{ id: string; url: string; events: string; active: number; created_at: string }>("SELECT id, url, events, active, created_at FROM webhooks WHERE org_id = ? ORDER BY created_at", u.orgId)).map((r) => ({ id: r.id, url: r.url, events: j(r.events, []), active: !!r.active, createdAt: r.created_at })),
  create: async (u: User, input: { url?: string; events?: string[] }) => {
    assertAdmin(u);
    let url: URL;
    try {
      url = new URL(input.url ?? "");
    } catch {
      throw new Invalid("Enter a valid URL");
    }
    const local = /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Invalid("Webhook URLs must use HTTPS");
    const events = (input.events ?? []).filter((e): e is WebhookEvent => (EVENTS as readonly string[]).includes(e));
    if (!events.length) throw new Invalid("Choose at least one event");
    const secret = `whsec_${randomBytes(24).toString("base64url")}`;
    const id = uid("wh_");
    await run("INSERT INTO webhooks (id, org_id, url, secret, events, active, created_by, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)", id, u.orgId, url.toString(), seal(secret), JSON.stringify(events), u.id, now());
    await audit.log(u, null, "webhook.created", { id, url: url.origin, events });
    return { id, secret };
  },
  remove: async (u: User, id: string) => {
    assertAdmin(u);
    await run("DELETE FROM webhooks WHERE id = ? AND org_id = ?", id, u.orgId);
    await audit.log(u, null, "webhook.deleted", { id });
  },
  deliveries: async (u: User, limit = 50) =>
    (await all<{ id: string; webhook_id: string; event: string; status: string; attempts: number; response_code: number | null; error: string | null; created_at: string; delivered_at: string | null }>("SELECT d.id, d.webhook_id, d.event, d.status, d.attempts, d.response_code, d.error, d.created_at, d.delivered_at FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id WHERE w.org_id = ? ORDER BY d.created_at DESC LIMIT ?", u.orgId, limit)).map((r) => ({ id: r.id, webhookId: r.webhook_id, event: r.event, status: r.status, attempts: r.attempts, responseCode: r.response_code, error: r.error, createdAt: r.created_at, deliveredAt: r.delivered_at })),
};

export function signPayload(secret: string, body: string, ts = Math.floor(Date.now() / 1000)) {
  return `t=${ts},v1=${createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")}`;
}

export function verifySignature(secret: string, body: string, header: string, toleranceS = 300) {
  const m = /t=(\d+),v1=([a-f0-9]{64})/.exec(header);
  if (!m || Math.abs(Date.now() / 1000 - Number(m[1])) > toleranceS) return false;
  const expected = createHmac("sha256", secret).update(`${m[1]}.${body}`).digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(m[2]));
}

const BACKOFF_S = [0, 30, 300, 1800, 7200];

export async function emit(orgId: string | null | undefined, event: WebhookEvent, data: Record<string, unknown>) {
  if (!orgId) return;
  const hooks = (await all<{ id: string; events: string }>("SELECT id, events FROM webhooks WHERE org_id = ? AND active = 1", orgId)).filter((h) => j<string[]>(h.events, []).includes(event));
  if (!hooks.length) return;
  const payload = JSON.stringify({ id: uid("evt_"), type: event, created: now(), data });
  for (const h of hooks) await run("INSERT INTO webhook_deliveries (id, webhook_id, event, payload, status, attempts, next_attempt_at, created_at) VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)", uid("dlv_"), h.id, event, payload, now(), now());
  void flushWebhooks();
}

let flushing: Promise<void> | null = null;

export async function flushWebhooks(): Promise<void> {
  if (flushing) {
    await flushing;
    return flushWebhooks();
  }
  flushing = (async () => {
    try {
      for (let pass = 0; pass < 20; pass++) {
      const due = await all<{ id: string; webhook_id: string; payload: string; attempts: number; url: string; secret: string }>("SELECT d.id, d.webhook_id, d.payload, d.attempts, w.url, w.secret FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id WHERE d.status IN ('pending', 'retrying') AND d.next_attempt_at <= ? ORDER BY d.created_at LIMIT 50", now());
      if (!due.length) break;
      for (const d of due) {
        const attempts = d.attempts + 1;
        let code: number | null = null;
        let error: string | null = null;
        try {
          const res = await fetch(d.url, { method: "POST", headers: { "content-type": "application/json", "chartside-signature": signPayload(unseal(d.secret), d.payload), "user-agent": "Chartside-Webhooks/1" }, body: d.payload, signal: AbortSignal.timeout(8000) });
          code = res.status;
          if (!res.ok) error = `HTTP ${res.status}`;
        } catch (err) {
          error = err instanceof Error ? err.message : "Delivery failed";
        }
        if (!error) await run("UPDATE webhook_deliveries SET status = 'delivered', attempts = ?, response_code = ?, error = NULL, delivered_at = ? WHERE id = ?", attempts, code, now(), d.id);
        else if (attempts >= BACKOFF_S.length) await run("UPDATE webhook_deliveries SET status = 'failed', attempts = ?, response_code = ?, error = ? WHERE id = ?", attempts, code, error, d.id);
        else await run("UPDATE webhook_deliveries SET status = 'retrying', attempts = ?, response_code = ?, error = ?, next_attempt_at = ? WHERE id = ?", attempts, code, error, new Date(Date.now() + BACKOFF_S[attempts] * 1000).toISOString(), d.id);
      }
      }
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

export async function redeliver(u: User, id: string) {
  assertAdmin(u);
  await run("UPDATE webhook_deliveries SET status = 'pending', next_attempt_at = ? WHERE id = ? AND webhook_id IN (SELECT id FROM webhooks WHERE org_id = ?)", now(), id, u.orgId);
  await flushWebhooks();
}

export async function pingWebhook(u: User, id: string) {
  assertAdmin(u);
  const h = await get<{ id: string }>("SELECT id FROM webhooks WHERE id = ? AND org_id = ?", id, u.orgId);
  if (!h) throw new Error("Webhook not found");
  const payload = JSON.stringify({ id: uid("evt_"), type: "ping", created: now(), data: { message: "Chartside webhook test" } });
  await run("INSERT INTO webhook_deliveries (id, webhook_id, event, payload, status, attempts, next_attempt_at, created_at) VALUES (?, ?, 'ping', ?, 'pending', 0, ?, ?)", uid("dlv_"), id, payload, now(), now());
  await flushWebhooks();
}

const g = globalThis as unknown as { __chartsideWebhookTimer?: ReturnType<typeof setInterval> };
if (typeof window === "undefined" && !g.__chartsideWebhookTimer && process.env.NODE_ENV !== "test") {
  g.__chartsideWebhookTimer = setInterval(() => void flushWebhooks().catch(() => {}), 15000);
  g.__chartsideWebhookTimer.unref?.();
}
