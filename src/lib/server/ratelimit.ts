import { run } from "../db";

const buckets = new Map<string, { n: number; reset: number }>();

export function clientIp(req: Request) {
  const hops = (req.headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  const trusted = Math.max(1, Number(process.env.CHARTSIDE_PROXY_HOPS || 1));
  return (hops[Math.max(0, hops.length - trusted)] || req.headers.get("x-real-ip") || "local").slice(0, 64);
}

export function limited(key: string, max: number, windowMs: number) {
  const t = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset <= t) {
    buckets.set(key, { n: 1, reset: t + windowMs });
    if (buckets.size > 50000) for (const [k, v] of buckets) if (v.reset <= t) buckets.delete(k);
    return false;
  }
  b.n++;
  return b.n > max;
}

export function tooMany() {
  return Response.json({ error: "Too many requests. Try again later." }, { status: 429, headers: { "retry-after": "600" } });
}

export function resetLimits() {
  buckets.clear();
}

export async function spendDaily(kind: string, max: number) {
  if (!(max > 0)) return false;
  const day = new Date().toISOString().slice(0, 10);
  const r = await run("INSERT INTO usage_daily (day, kind, n) VALUES (?, ?, 1) ON CONFLICT (day, kind) DO UPDATE SET n = usage_daily.n + 1 WHERE usage_daily.n < ?", day, kind.slice(0, 64), max);
  return r.changes > 0;
}
