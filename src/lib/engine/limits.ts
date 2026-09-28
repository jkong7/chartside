export const DEFAULT_RECORDING_MINUTES = 120;
export const WARN_BEFORE_MINUTES = 30;
export const STUCK_AFTER_MS = 3 * 60 * 1000;

export function recordingLimit(elapsedS: number, maxMinutes = DEFAULT_RECORDING_MINUTES) {
  const remaining = Math.max(0, Math.ceil((maxMinutes * 60 - elapsedS) / 60));
  const state: "ok" | "warn" | "limit" = elapsedS >= maxMinutes * 60 ? "limit" : remaining <= Math.min(WARN_BEFORE_MINUTES, Math.floor(maxMinutes / 4)) ? "warn" : "ok";
  return { state, remainingMinutes: remaining };
}

export function isStuck(enc: { status: string; endedAt: string | null }, at = Date.now()) {
  return enc.status === "processing" && !!enc.endedAt && at - new Date(enc.endedAt).getTime() > STUCK_AFTER_MS;
}

export function recordingMinutesFromEnv(v = process.env.CHARTSIDE_MAX_RECORDING_MIN) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 5 && n <= 480 ? Math.round(n) : DEFAULT_RECORDING_MINUTES;
}
