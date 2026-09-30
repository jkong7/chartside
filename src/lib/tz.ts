export const DEFAULT_TZ = "America/Chicago";
export const TZ_COOKIE = "cs_tz";

export function validTz(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$|^UTC$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function clinicTz() {
  const env = typeof process !== "undefined" ? process.env.CHARTSIDE_TZ : undefined;
  return validTz(env) ? env : DEFAULT_TZ;
}

export function tzOf(u?: { prefs?: { tz?: string | null } } | null, fallback?: string | null) {
  if (validTz(u?.prefs?.tz)) return u!.prefs!.tz!;
  if (validTz(fallback)) return fallback;
  return clinicTz();
}

export function clockTime(at: string | number | Date, tz: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: validTz(tz) ? tz : clinicTz() }).format(new Date(at));
}

export function dateTime(at: string | number | Date, tz: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: validTz(tz) ? tz : clinicTz() }).format(new Date(at));
}

export function offsetMinutes(at: Date, tz: string) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}

export function localDay(at: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function localHour(at: Date, tz: string) {
  return Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(at));
}

export function zonedTime(day: string, time: string, tz: string) {
  const [h, m] = time.split(":").map(Number);
  const base = Date.parse(`${day}T00:00:00Z`) + ((h || 0) * 60 + (m || 0)) * 60_000;
  let guess = base;
  for (let i = 0; i < 3; i++) guess = base - offsetMinutes(new Date(guess), tz) * 60_000;
  return new Date(guess);
}

export function localMidnight(day: string, tz: string) {
  return zonedTime(day, "00:00", tz);
}

export function wallTime(daysAgo: number, time: string, tz: string, now = new Date()) {
  const today = localDay(now, tz);
  const d = new Date(Date.parse(`${today}T12:00:00Z`) - daysAgo * 86400_000).toISOString().slice(0, 10);
  return zonedTime(d, time, tz);
}

export function dayBounds(at: Date, tz: string) {
  const day = localDay(at, tz);
  const next = localDay(new Date(localMidnight(day, tz).getTime() + 36 * 3600_000), tz);
  return { from: localMidnight(day, tz).toISOString(), to: localMidnight(next, tz).toISOString() };
}
