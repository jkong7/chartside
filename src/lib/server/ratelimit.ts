const buckets = new Map<string, { n: number; reset: number }>();

export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "local").trim().slice(0, 64);
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
