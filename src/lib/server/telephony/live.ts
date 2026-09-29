export interface LiveCall {
  callSid: string;
  userId: string;
  startedAt: number;
  state: string;
  encounterId: string | null;
  lines: { at: number; text: string }[];
  control(action: "pause" | "resume" | "end"): Promise<void>;
}

const g = globalThis as unknown as { __chartsideLiveCalls?: Map<string, LiveCall> };
const calls = (g.__chartsideLiveCalls ??= new Map<string, LiveCall>());

export function registerCall(c: LiveCall) {
  calls.set(c.callSid, c);
}

export function updateCall(callSid: string, patch: Partial<Pick<LiveCall, "state" | "encounterId">>) {
  const c = calls.get(callSid);
  if (c) Object.assign(c, patch);
}

export function heardOnCall(callSid: string, text: string) {
  const c = calls.get(callSid);
  if (!c) return;
  c.lines.push({ at: Date.now(), text });
  if (c.lines.length > 40) c.lines.splice(0, c.lines.length - 40);
}

export function endCall(callSid: string) {
  calls.delete(callSid);
}

export function liveCallsFor(userId: string) {
  return [...calls.values()]
    .filter((c) => c.userId === userId && c.state !== "ended")
    .map((c) => ({ callSid: c.callSid, startedAt: new Date(c.startedAt).toISOString(), seconds: Math.round((Date.now() - c.startedAt) / 1000), state: c.state, encounterId: c.encounterId, lines: c.state === "recording" || c.state === "paused" ? c.lines.slice(-6).map((l) => l.text) : [] }));
}

export async function controlCall(userId: string, callSid: string, action: "pause" | "resume" | "end") {
  const c = calls.get(callSid);
  if (!c || c.userId !== userId) return false;
  await c.control(action);
  return true;
}
