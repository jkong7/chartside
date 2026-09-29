import { appendCaptureAudio, captureAudio, captureNote, captureStatus, finishCaptureFor } from "../capture";
import { hasPhonePin, mintLoginLink, verifyPhonePin } from "../magic";
import { runAgent, type AgentTurn } from "../agent";
import { actorFor, artifacts, audit, type User } from "../repo";
import { spokenBrief, speakable } from "./brief";
import type { CallDeps } from "./call";
import { nextVisitFor } from "./schedule";
import { sendText } from "./sms";
import type { CallClaims } from "./token";
import { wavFromPcm } from "./mulaw";

async function loginLink(user: User, path: string, phone: string) {
  const { url } = await mintLoginLink(user.id, path, 30, { verifiesPhone: user.guestUntil ? phone : null });
  return url;
}

function streamingWavHeader() {
  const h = wavFromPcm(new Int16Array(0), 8000);
  h.writeUInt32LE(0xffffffff, 4);
  h.writeUInt32LE(0xffffffff - 44, 40);
  return h;
}

const FLUSH_SAMPLES = 8000 * 8;

export interface PhoneSession {
  deps: Omit<CallDeps, "say" | "hangup">;
  pushAudio(pcm: Int16Array): void;
  encounterId(): string | null;
  user: User;
}

export async function phoneSession(claims: CallClaims, opts: { waitMs?: number; pollMs?: number } = {}): Promise<PhoneSession> {
  const user = await actorFor(claims.userId, claims.orgId);
  if (!user) throw new Error("Caller account not found");
  let encId: string | null = null;
  let pending: Int16Array[] = [];
  let pendingSamples = 0;
  let totalSamples = 0;
  let wroteHeader = false;
  let chain: Promise<unknown> = Promise.resolve();
  let pinOk = false;
  const history: AgentTurn[] = [];
  const startedAt = Date.now();

  const flushNow = async () => {
    if (!encId || !pendingSamples) return;
    const merged = new Int16Array(pendingSamples);
    let off = 0;
    for (const p of pending) {
      merged.set(p, off);
      off += p.length;
    }
    pending = [];
    pendingSamples = 0;
    const body = Buffer.from(merged.buffer, merged.byteOffset, merged.byteLength);
    const bytes = wroteHeader ? body : Buffer.concat([streamingWavHeader(), body]);
    wroteHeader = true;
    await appendCaptureAudio(user, encId, { bytes, mime: "audio/wav", options: { durationS: Math.max(1, Math.round(totalSamples / 8000)) } });
  };
  const flush = () => (chain = chain.then(flushNow).catch((err) => console.error("phone flush failed", err)));

  let ready: Promise<string | null> | null = null;
  const waitReady = (maxMs: number) =>
    (ready ??= (async () => {
      if (!encId) return null;
      const until = Date.now() + maxMs;
      while (Date.now() < until) {
        const s = await captureStatus({ user, tokenId: null }, encId).catch(() => null);
        if (s?.status === "ready" || s?.status === "signed") return encId;
        if (s?.status === "failed") return null;
        await new Promise((r) => setTimeout(r, opts.pollMs ?? 1000));
      }
      return null;
    })());

  const reviewPath = () => `/go/stack?focus=${encodeURIComponent(encId ?? "")}`;
  const when = () => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: process.env.CHARTSIDE_TZ || "America/Chicago" }).format(new Date(startedAt));

  const deps: PhoneSession["deps"] = {
    caller: { name: user.guestUntil ? null : user.name, guest: !!user.guestUntil, hasPin: !user.guestUntil && !claims.guest && (await hasPhonePin(user.id)) },
    verifyPin: async (pin) => (pinOk = await verifyPhonePin(user.id, pin)),
    nextVisit: () => nextVisitFor(user),
    open: async ({ encounterId, lang }) => {
      const r = await captureAudio(user, { options: { consent: "granted", method: "verbal", state: user.prefs.state || "IL", finish: false, channel: claims.sim ? "phone-sim" : "phone", reason: "", ...(lang ? { lang } : {}), ...(encounterId ? { encounterId } : {}) } as never });
      encId = r.encounterId;
      await audit.log(user, encId, "phone.consent", { callSid: claims.callSid, sim: claims.sim });
    },
    flush: () => flush(),
    finish: async () => {
      await flush();
      if (!encId) return;
      if (!wroteHeader) return;
      await finishCaptureFor(user, encId, { durationS: Math.max(1, Math.round(totalSamples / 8000)) }).catch((err) => console.error("phone finish failed", err));
    },
    waitForNote: async () => {
      const id = await waitReady(opts.waitMs ?? 75_000);
      if (!id) return null;
      const note = await captureNote({ user, tokenId: null }, id);
      return { spoken: spokenBrief(note, Math.round(totalSamples / 8000 / 60) || null) };
    },
    converse: async (text) => {
      if (!encId) return "There's no note to change yet.";
      history.push({ role: "user", content: text });
      const r = await runAgent(user, history.slice(-8), { channel: "voice", phiScope: pinOk ? "full" : "call", encounterId: encId });
      history.push({ role: "assistant", content: r.reply });
      await audit.log(user, encId, "phone.agent_turn", { proposals: r.proposals.length, engine: r.engine });
      return speakable(r.reply);
    },
    markReady: async () => {
      if (!encId) return;
      await artifacts.set(encId, "phone_ready", { at: new Date().toISOString(), callSid: claims.callSid });
      await audit.log(user, encId, "phone.ready_to_sign", {});
    },
    textLink: async (reason) => {
      if (!encId) return;
      const send = async () => {
        const link = await loginLink(user, reviewPath(), claims.phone);
        const body = user.guestUntil
          ? `Chartside: your note from the ${when()} call is ready. Tap to save it (free): ${link}`
          : `Chartside: your note from the ${when()} call is ready. Review and sign: ${link}`;
        await sendText(claims.phone, body);
        await audit.log(user, encId, "phone.texted", { reason });
      };
      if (reason === "ready") return send();
      void (async () => {
        const id = await waitReady(10 * 60_000);
        if (!id) {
          await sendText(claims.phone, `Chartside: we couldn't finish the note from your ${when()} call. Open Chartside to retry: ${await loginLink(user, "/go", claims.phone)}`).catch(() => {});
          return;
        }
        await send();
      })().catch((err) => console.error("phone text failed", err));
    },
    declined: async () => {
      await audit.log(user, null, "phone.consent_declined", { callSid: claims.callSid });
    },
    log: (event, data) => {
      if (process.env.CHARTSIDE_PHONE_DEBUG) console.log(event, data ?? "");
    },
  };

  return {
    deps,
    user,
    encounterId: () => encId,
    pushAudio(pcm) {
      if (!encId) return;
      pending.push(pcm);
      pendingSamples += pcm.length;
      totalSamples += pcm.length;
      if (pendingSamples >= FLUSH_SAMPLES) void flush();
    },
  };
}
