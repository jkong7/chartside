import { appendCaptureAudio, captureAudio, captureNote, captureStatus, finishCaptureFor } from "../capture";
import { hasPhonePin, mintLoginLink, verifyPhonePin } from "../magic";
import { runAgent, type AgentTurn } from "../agent";
import { run } from "../../db";
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
  recordedSeconds(): number;
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
  let scheduledVisit = false;
  const history: AgentTurn[] = [];
  const askHistory: AgentTurn[] = [];
  let startedAt = Date.now();

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

  let poller: Promise<string | null> | null = null;
  const LONGEST_WAIT_MS = 10 * 60_000;
  const pollReady = () =>
    (poller ??= (async () => {
      if (!encId) return null;
      const until = Date.now() + LONGEST_WAIT_MS;
      while (Date.now() < until) {
        const s = await captureStatus({ user, tokenId: null }, encId).catch(() => null);
        if (s?.status === "ready" || s?.status === "signed") return encId;
        if (s?.status === "failed") return null;
        await new Promise((r) => setTimeout(r, opts.pollMs ?? 1000));
      }
      return null;
    })());
  const waitReady = (maxMs: number) => {
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<"timeout">((r) => (timer = setTimeout(() => r("timeout"), maxMs)));
    return Promise.race([pollReady(), deadline]).finally(() => clearTimeout(timer));
  };

  const reviewPath = () => `/go/stack?focus=${encodeURIComponent(encId ?? "")}`;
  const when = () => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: process.env.CHARTSIDE_TZ || "America/Chicago" }).format(new Date(startedAt));

  const deps: PhoneSession["deps"] = {
    caller: { name: user.guestUntil ? null : user.name, guest: !!user.guestUntil, hasPin: !user.guestUntil && !claims.guest && (await hasPhonePin(user.id)) },
    verifyPin: async (pin) => (pinOk = await verifyPhonePin(user.id, pin)),
    nextVisit: () => nextVisitFor(user),
    startNext: () => {
      encId = null;
      scheduledVisit = false;
      pending = [];
      pendingSamples = 0;
      totalSamples = 0;
      wroteHeader = false;
      poller = null;
      history.length = 0;
    },
    open: async ({ encounterId, lang }) => {
      startedAt = Date.now();
      const r = await captureAudio(user, { options: { consent: "granted", method: "verbal", state: user.prefs.state || "IL", finish: false, channel: claims.sim ? "phone-sim" : "phone", reason: "", ...(lang ? { lang } : {}), ...(encounterId ? { encounterId } : {}) } as never });
      encId = r.encounterId;
      scheduledVisit = !!encounterId;
      const verifiedBy = user.guestUntil ? "guest" : pinOk ? "pin" : "caller-id";
      await artifacts.set(encId, "phone_call", { callSid: claims.callSid, sim: claims.sim, verifiedBy, phone: claims.phone, scheduledVisit, startedAt: new Date(startedAt).toISOString() });
      await audit.log(user, encId, "phone.consent", { callSid: claims.callSid, sim: claims.sim, verifiedBy });
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
      if (!id || id === "timeout") return null;
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
    ask: async (text) => {
      if (!pinOk) throw new Error("PIN required");
      const turns: AgentTurn[] = [...askHistory.slice(-6), { role: "user", content: text }];
      const r = await runAgent(user, turns, { channel: "voice", phiScope: "full" });
      askHistory.push({ role: "user", content: text }, { role: "assistant", content: r.reply });
      await audit.log(user, null, "phone.chart_question", { engine: r.engine, tools: r.citations.length });
      return speakable(r.reply);
    },
    queueSummary: async () => {
      if (!encId) return "none";
      const { encounters } = await import("../repo");
      const enc = await encounters.get(user, encId);
      if (!enc?.patientId) return "unmatched";
      await artifacts.set(encId, "summary_on_sign", { at: new Date().toISOString(), callSid: claims.callSid });
      await audit.log(user, encId, "phone.summary_queued", {});
      return "queued";
    },
    markReady: async () => {
      if (!encId) return;
      await artifacts.set(encId, "phone_ready", { at: new Date().toISOString(), callSid: claims.callSid });
      await audit.log(user, encId, "phone.ready_to_sign", {});
    },
    textLink: async (reason) => {
      if (!encId) return false;
      const fresh = await actorFor(user.id, user.orgId).catch(() => undefined);
      if (fresh?.prefs.textOptOut) {
        await audit.log(user, encId, "phone.text_skipped", { reason: "opted_out" });
        return false;
      }
      const send = async () => {
        const link = await loginLink(user, reviewPath(), claims.phone);
        const body = user.guestUntil
          ? `Chartside: your note from the ${when()} call is ready. Tap to save it (free): ${link}`
          : `Chartside: your note from the ${when()} call is ready. Review and sign: ${link}`;
        await sendText(claims.phone, body);
        await audit.log(user, encId, "phone.texted", { reason });
      };
      if (reason === "ready") {
        try {
          await send();
          return true;
        } catch (err) {
          console.error("phone text failed", err instanceof Error ? err.message : err);
          await audit.log(user, encId, "phone.text_failed", {});
          return false;
        }
      }
      void (async () => {
        const id = await waitReady(LONGEST_WAIT_MS);
        if (!id || id === "timeout") {
          await sendText(claims.phone, `Chartside: we couldn't finish the note from your ${when()} call. Open Chartside to retry: ${await loginLink(user, "/go", claims.phone)}`).catch(() => {});
          return;
        }
        await send();
      })().catch((err) => console.error("phone text failed", err instanceof Error ? err.message : err));
      return true;
    },
    abandon: async () => {
      if (!encId || wroteHeader) return;
      if (scheduledVisit) {
        await run("UPDATE encounters SET status = 'scheduled', started_at = NULL WHERE id = ?", encId);
        await run("DELETE FROM artifacts WHERE encounter_id = ? AND kind IN ('capture_origin', 'phone_call')", encId);
        await audit.log(user, encId, "phone.abandoned", { callSid: claims.callSid, scheduled: true });
        encId = null;
        return;
      }
      await run("DELETE FROM encounters WHERE id = ?", encId);
      await audit.log(user, null, "phone.abandoned", { callSid: claims.callSid });
      encId = null;
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
    recordedSeconds: () => totalSamples / 8000,
    pushAudio(pcm) {
      if (!encId) return;
      pending.push(pcm);
      pendingSamples += pcm.length;
      totalSamples += pcm.length;
      if (pendingSamples >= FLUSH_SAMPLES) void flush();
    },
  };
}
