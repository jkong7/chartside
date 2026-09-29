import { affirmative, bareWake, consentGiven, consentRefused, directAnswer, directedAtScribe, echoOf, negative, reviewIntent, wakeCommand } from "./intents";

export type CallState = "greeting" | "pin" | "newPin" | "newPinAgain" | "confirmPatient" | "consent" | "recording" | "paused" | "drafting" | "review" | "ended";

export interface NextVisit {
  encounterId: string;
  spoken: string;
}

export interface NoteBrief {
  spoken: string;
}

export interface CallDeps {
  say(text: string, lang?: "en" | "es"): Promise<void>;
  hangup(): void;
  caller: { name: string | null; guest: boolean; hasPin: boolean };
  verifyPin(pin: string): Promise<boolean>;
  nextVisit(): Promise<NextVisit | null>;
  open(input: { encounterId?: string; lang?: "en" | "multi" }): Promise<void>;
  flush(): Promise<void>;
  finish(): Promise<void>;
  waitForNote(): Promise<NoteBrief | null>;
  converse(text: string): Promise<string>;
  ask?(text: string): Promise<string>;
  offerPin?(pin: string): Promise<"texted" | "invalid" | "unavailable">;
  markReady(): Promise<void>;
  queueSummary?(): Promise<"queued" | "unmatched" | "none">;
  startNext?(): void;
  textLink(reason: "ready" | "processing"): Promise<boolean>;
  declined(): Promise<void>;
  abandon(): Promise<void>;
  log(event: string, data?: Record<string, unknown>): void;
  echoWindowMs?: number;
  fillerMs?: number;
}

export const LINES = {
  consentAsk: "When your patient agrees to be recorded, say they agreed, or press 2. Press 3, and I'll ask them for you. For Spanish, press 9.",
  consentScriptEs: "Hola, soy Chartside, un asistente de inteligencia artificial que ayuda a su médico a escribir la nota de la visita. Su médico revisa todo, y la grabación se borra después. ¿Está bien si escucho? Puede decir sí, o no.",
  consentScript: "Hi, I'm Chartside, an AI assistant that helps your clinician write the visit note. They review everything, and the recording is deleted afterward. Is it okay if I listen? You can say yes, or no.",
  recording: "Thanks. I'm listening and I'll stay quiet. Say Chartside, pause, or Chartside, end visit, any time. Or just hang up when you're done.",
  paused: "Paused. Nothing is being recorded. Say Chartside, resume, or press 2 to keep going.",
  resumed: "Listening again.",
  drafting: "Got it. Writing your note now. Stay on the line to hear it, or hang up and I'll text you when it's ready.",
  declined: "Understood. Nothing was recorded. You can call back any time. Goodbye.",
  reviewPrompt: "Say ready, or next patient to keep going, or tell me what to change.",
  reviewPromptGuest: "Say ready, or tell me what to change.",
  nextPatient: "Saved for you to sign. Next patient.",
  ready: "Done. It's ready for you to sign. I'm texting you the link. Goodbye.",
  readyGuest: "Done. I'm texting you a link to read it and save it, free. Goodbye.",
  readyNoText: "Done. It's ready for you to sign. I couldn't send you a text, so open Chartside to review it. Goodbye.",
  later: "Okay. I'm texting you the link now. Goodbye.",
  laterNoText: "I couldn't send you a text, but your note is waiting in Chartside. Goodbye.",
  openFailed: "Sorry, I couldn't start recording. Nothing was kept. Please call back in a moment.",
  slow: "This one is taking longer than usual. I'll text you as soon as it's ready. Goodbye.",
  pinAsk: "Enter your phone PIN, then pound, to hear your schedule. Or press star to just record.",
  pinBad: "That PIN didn't match. You can still record, and I'll match the patient afterward.",
  anythingElse: "Anything else? Say ready when it looks right.",
  notHeard: "Sorry, I didn't catch that.",
  limit: "This visit has reached the recording limit, so I'm ending it now.",
  pinOffer: "Tip: press 6 to set a phone PIN.",
  newPinAsk: "Enter a new PIN of 4 to 6 digits, then pound.",
  newPinAgain: "Enter it again, then pound.",
  newPinMismatch: "Those didn't match, so I didn't set a PIN.",
  newPinWeak: "That PIN is too easy to guess, so I didn't set it. Avoid repeated digits or digits in a row.",
  newPinTexted: "I texted you a link. Tap it and type the same PIN to turn it on.",
  newPinNoText: "I couldn't text you a link right now. You can set a PIN in Chartside settings.",
  newPinCancelled: "Okay, no PIN for now.",
  lowAudio: "I can barely hear the room. Move the phone closer, face up, between you and your patient.",
  stillWriting: "Still writing. You can hang up any time, and I'll text you.",
  almostThere: "Almost there.",
  summaryQueued: "I'll text your patient their visit summary as soon as you sign the note.",
  summaryUnmatched: "Once you match this visit to a patient, you can send their summary from your stack.",
  askNeedsPin: "I can answer questions about your chart once you've entered your phone PIN at the start of a call.",
  askMore: "Anything else? Or press 2 when your patient agrees to be recorded.",
} as const;

export class ScribeCall {
  state: CallState = "greeting";
  private busy = false;
  private hasAudio = false;
  private lastSpoken = "";
  private reviewTurns = 0;
  private pendingVisit: NextVisit | null = null;
  private pinDigits = "";
  private spanish = false;
  private recentSpoken: string[] = [];
  private askedPatientAt = 0;
  private wakePrimedAt = 0;
  private spokeEndedAt = 0;
  private pinVerified = false;
  private newPin = "";
  private pinOffered = false;
  private newPinFirst = "";

  constructor(private deps: CallDeps) {}

  get isBusy() {
    return this.busy;
  }

  get capturing() {
    return this.state === "recording";
  }

  async start() {
    const who = this.deps.caller.name ? ` ${this.deps.caller.name}` : "";
    const intro = this.deps.caller.guest
      ? "Hi, this is Chartside, an AI scribe, on a recorded line. Your first note is free, and there's nothing to sign up for."
      : `Hi${who}. This is your Chartside scribe, on a recorded line.`;
    if (!this.deps.caller.guest && this.deps.caller.hasPin) {
      this.state = "pin";
      await this.say(`${intro} ${LINES.pinAsk}`);
      return;
    }
    this.state = "consent";
    const tip = !this.deps.caller.guest && !this.deps.caller.hasPin && this.deps.offerPin ? ` ${LINES.pinOffer}` : "";
    await this.say(`${intro} ${LINES.consentAsk}${tip}`);
  }

  private async afterPin(ok: boolean) {
    this.pinDigits = "";
    if (!ok) {
      this.state = "consent";
      await this.say(`${LINES.pinBad} ${LINES.consentAsk}`);
      return;
    }
    this.deps.log("call.pin_ok");
    this.pinVerified = true;
    const next = await this.deps.nextVisit().catch(() => null);
    if (next) {
      this.pendingVisit = next;
      this.state = "confirmPatient";
      await this.say(`Thanks. ${next.spoken} Is that who you're seeing?`);
      return;
    }
    this.state = "consent";
    await this.say(`Thanks. I don't see a scheduled visit right now, so I'll match the patient afterward. ${LINES.consentAsk}`);
  }

  private remember(text: string) {
    this.lastSpoken = text;
    this.recentSpoken = [...this.recentSpoken.slice(-3), text];
  }

  private async say(text: string, lang?: "en" | "es") {
    this.remember(text);
    await this.deps.say(text, lang);
    this.spokeEndedAt = Date.now();
  }

  async onTranscript(text: string) {
    if (!text.trim() || this.busy || this.state === "ended") return;
    if (echoOf(text, this.recentSpoken, Date.now() - this.spokeEndedAt < (this.deps.echoWindowMs ?? 2000))) {
      this.deps.log("call.echo_ignored");
      return;
    }
    this.busy = true;
    try {
      await this.handleTranscript(text);
    } finally {
      this.busy = false;
    }
  }

  private async handleTranscript(text: string): Promise<void> {
    switch (this.state) {
      case "confirmPatient": {
        if (affirmative(text)) {
          this.deps.log("call.patient_confirmed");
          this.state = "consent";
          await this.say(`Great. ${LINES.consentAsk}`);
        } else if (negative(text)) {
          this.pendingVisit = null;
          this.deps.log("call.patient_other");
          this.state = "consent";
          await this.say(`No problem, I'll match the patient afterward. ${LINES.consentAsk}`);
        }
        return;
      }
      case "consent": {
        const asked = /^\s*chart ?side[,.!]?\s+(.+)$/i.exec(text.trim());
        if (asked && directedAtScribe(asked[1]) && !wakeCommand(text)) {
          if (!this.pinVerified || !this.deps.ask) return this.say(LINES.askNeedsPin);
          this.deps.log("call.chart_question");
          const answer = await this.deps.ask(asked[1]).catch(() => "Sorry, I couldn't look that up right now.");
          return this.say(`${answer} ${LINES.askMore}`);
        }
        if (consentRefused(text)) return this.decline();
        if (consentGiven(text)) return this.beginRecording();
        if (this.askedPatientAt && Date.now() - this.askedPatientAt < 25_000) {
          const a = directAnswer(text);
          if (a === "no") return this.decline();
          if (a === "yes") return this.beginRecording();
        }
        return;
      }
      case "recording":
      case "paused": {
        if (bareWake(text)) {
          this.wakePrimedAt = Date.now();
          return;
        }
        const primed = this.wakePrimedAt && Date.now() - this.wakePrimedAt < 6000;
        this.wakePrimedAt = 0;
        const cmd = wakeCommand(primed ? `chartside ${text}` : text);
        if (cmd === "pause" && this.state === "recording") return this.pause();
        if (cmd === "resume" && this.state === "paused") return this.resume();
        if (cmd === "end") return this.endVisit();
        return;
      }
      case "review": {
        if (!directedAtScribe(text)) {
          this.deps.log("call.ignored_chatter");
          return;
        }
        const intent = reviewIntent(text.replace(/^\s*chart ?side[,.!]?\s*/i, ""));
        if (intent.kind === "repeat") return this.say(this.lastSpoken);
        if (intent.kind === "next") {
          if (this.deps.startNext && !this.deps.caller.guest) return this.nextPatient();
          return this.handleTranscript("ready");
        }
        if (intent.kind === "summary") {
          const r = this.deps.queueSummary ? await this.deps.queueSummary().catch(() => "none" as const) : "none";
          return this.say(`${r === "queued" ? LINES.summaryQueued : LINES.summaryUnmatched} ${LINES.anythingElse}`);
        }
        if (intent.kind === "ready") {
          await this.deps.markReady();
          const sent = await this.deps.textLink("ready").catch(() => false);
          await this.say(!sent ? LINES.readyNoText : this.deps.caller.guest ? LINES.readyGuest : LINES.ready);
          return this.close();
        }
        if (intent.kind === "later") {
          const sent = await this.deps.textLink("ready").catch(() => false);
          await this.say(sent ? LINES.later : LINES.laterNoText);
          return this.close();
        }
        this.reviewTurns++;
        const reply = await this.deps.converse(intent.text.replace(/^\s*chart ?side[,.!]?\s*/i, "")).catch(() => "Sorry, I couldn't do that one. You can change it when you review the note.");
        await this.say(`${reply} ${this.reviewTurns === 1 ? LINES.anythingElse : ""}`.trim());
        return;
      }
    }
  }

  async onDigit(d: string) {
    if (this.busy || this.state === "ended") return;
    this.busy = true;
    try {
      if (this.state === "pin") {
        if (d === "*") {
          this.pinDigits = "";
          this.state = "consent";
          return await this.say(LINES.consentAsk);
        }
        if (d === "#") return await this.afterPin(this.pinDigits.length >= 4 && (await this.deps.verifyPin(this.pinDigits).catch(() => false)));
        if (/^\d$/.test(d)) {
          this.pinDigits += d;
          if (this.pinDigits.length >= 6) return await this.afterPin(await this.deps.verifyPin(this.pinDigits).catch(() => false));
        }
        return;
      }
      if (this.state === "newPin" || this.state === "newPinAgain") {
        if (d === "*") {
          this.newPin = "";
          this.newPinFirst = "";
          this.state = "consent";
          return await this.say(`${LINES.newPinCancelled} ${LINES.consentAsk}`);
        }
        if (/^\d$/.test(d)) {
          if (this.newPin.length < 6) this.newPin += d;
          return;
        }
        if (d !== "#") return;
        const entered = this.newPin;
        this.newPin = "";
        if (this.state === "newPin") {
          this.newPinFirst = entered;
          this.state = "newPinAgain";
          return await this.say(LINES.newPinAgain);
        }
        const first = this.newPinFirst;
        this.newPinFirst = "";
        this.state = "consent";
        if (entered !== first || entered.length < 4) return await this.say(`${LINES.newPinMismatch} ${LINES.consentAsk}`);
        const r = await this.deps.offerPin!(entered).catch(() => "unavailable" as const);
        if (r !== "invalid") this.pinOffered = true;
        this.deps.log("call.pin_offer", { result: r });
        return await this.say(`${r === "texted" ? LINES.newPinTexted : r === "invalid" ? LINES.newPinWeak : LINES.newPinNoText} ${LINES.consentAsk}`);
      }
      if (this.state === "confirmPatient") {
        if (d === "1") {
          this.state = "consent";
          await this.say(`Great. ${LINES.consentAsk}`);
        } else if (d === "0" || d === "3") {
          this.pendingVisit = null;
          this.state = "consent";
          await this.say(`No problem, I'll match the patient afterward. ${LINES.consentAsk}`);
        }
        return;
      }
      if (this.state === "consent") {
        if (d === "6" && this.deps.offerPin && !this.deps.caller.guest && !this.deps.caller.hasPin && !this.pinOffered) {
          this.state = "newPin";
          this.newPin = "";
          return await this.say(LINES.newPinAsk);
        }
        if (d === "3") {
          await this.say(LINES.consentScript);
          this.askedPatientAt = Date.now();
          return;
        }
        if (d === "9") {
          this.spanish = true;
          this.deps.log("call.spanish");
          await this.say(LINES.consentScriptEs, "es");
          this.askedPatientAt = Date.now();
          return;
        }
        if (d === "2" || d === "1") return await this.beginRecording();
        if (d === "0") return await this.decline();
        return;
      }
      if (this.state === "recording" && d === "4") return await this.pause();
      if (this.state === "paused" && d === "2") return await this.resume();
      if ((this.state === "recording" || this.state === "paused") && d === "5") return await this.endVisit();
      if (this.state === "review") {
        if (d === "1") return await this.handleTranscript("ready");
        if (d === "9") return await this.say(this.lastSpoken);
        if (d === "7") return await this.handleTranscript("text the patient their summary");
        if (d === "8") return await this.handleTranscript("next patient");
        if (d === "5" || d === "#") return await this.handleTranscript("text me");
      }
    } finally {
      this.busy = false;
    }
  }

  async remote(action: "pause" | "resume" | "end") {
    while (this.busy && this.state !== "ended") await new Promise((r) => setTimeout(r, 100));
    if (this.state !== "recording" && this.state !== "paused") return;
    this.busy = true;
    try {
      this.deps.log(`call.remote_${action}`);
      if (action === "pause" && this.state === "recording") await this.pause();
      else if (action === "resume" && this.state === "paused") await this.resume();
      else if (action === "end") await this.endVisit();
    } finally {
      this.busy = false;
    }
  }

  async onQuiet() {
    if (this.state !== "recording" || this.busy) return;
    this.deps.log("call.low_audio");
    await this.say(LINES.lowAudio);
  }

  async onLimit() {
    while (this.busy && this.state !== "ended") await new Promise((r) => setTimeout(r, 100));
    if (this.state !== "recording" && this.state !== "paused") return;
    this.busy = true;
    try {
      this.deps.log("call.limit");
      await this.say(LINES.limit);
      await this.endVisit();
    } finally {
      this.busy = false;
    }
  }

  onAudio() {
    if (this.state === "recording") this.hasAudio = true;
  }

  private async beginRecording() {
    const lang = this.spanish ? ("multi" as const) : undefined;
    try {
      await this.deps.open({ encounterId: this.pendingVisit?.encounterId, lang });
    } catch (err) {
      if (!this.pendingVisit) return this.failOpen(err);
      this.deps.log("call.scheduled_open_failed", { error: err instanceof Error ? err.message : "error" });
      this.pendingVisit = null;
      try {
        await this.deps.open({ lang });
      } catch (err2) {
        return this.failOpen(err2);
      }
    }
    if (this.state === "ended") {
      await this.deps.abandon();
      return;
    }
    this.deps.log("call.consent_granted", { scheduled: !!this.pendingVisit });
    this.state = "recording";
    await this.say(LINES.recording);
  }

  private async nextPatient() {
    await this.deps.markReady();
    await this.deps.textLink("ready").catch(() => false);
    this.deps.startNext!();
    this.deps.log("call.next_patient");
    this.hasAudio = false;
    this.pendingVisit = null;
    this.spanish = false;
    this.askedPatientAt = 0;
    this.reviewTurns = 0;
    const next = this.pinVerified ? await this.deps.nextVisit().catch(() => null) : null;
    if (next) {
      this.pendingVisit = next;
      this.state = "confirmPatient";
      await this.say(`${LINES.nextPatient} ${next.spoken} Is that who you're seeing?`);
      return;
    }
    this.state = "consent";
    await this.say(`${LINES.nextPatient} ${LINES.consentAsk}`);
  }

  private async failOpen(err: unknown) {
    this.deps.log("call.open_failed", { error: err instanceof Error ? err.message : "error" });
    if (this.state === "ended") return;
    this.state = "ended";
    await this.deps.say(LINES.openFailed);
    this.deps.hangup();
  }

  private async decline() {
    this.state = "ended";
    await this.deps.declined();
    await this.deps.say(LINES.declined);
    this.deps.hangup();
  }

  private async pause() {
    this.state = "paused";
    await this.deps.flush();
    this.deps.log("call.paused");
    await this.say(LINES.paused);
  }

  private async resume() {
    if (this.state === "ended") return;
    this.state = "recording";
    this.deps.log("call.resumed");
    await this.say(LINES.resumed);
  }

  private async endVisit() {
    this.state = "drafting";
    await this.say(LINES.drafting);
    await this.deps.finish();
    const pending = this.deps.waitForNote();
    const every = this.deps.fillerMs ?? 9000;
    let note: NoteBrief | null | undefined;
    for (let i = 0; note === undefined; i++) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tick = new Promise<"tick">((r) => (timer = setTimeout(() => r("tick"), every)));
      const r = await Promise.race([pending, tick]);
      clearTimeout(timer);
      if (r !== "tick") note = r;
      else if (this.state === "drafting") await this.say(i % 2 ? LINES.almostThere : LINES.stillWriting);
      else note = null;
    }
    if (this.state !== "drafting") return;
    if (!note) {
      await this.deps.textLink("processing");
      await this.say(LINES.slow);
      return this.close();
    }
    this.state = "review";
    await this.say(`${note.spoken} ${this.deps.caller.guest ? LINES.reviewPromptGuest : LINES.reviewPrompt}`);
  }

  private close() {
    this.state = "ended";
    this.deps.hangup();
  }

  async onHangup() {
    const was = this.state;
    this.state = "ended";
    this.deps.log("call.hangup", { state: was });
    if (was === "recording" || was === "paused") {
      if (!this.hasAudio) {
        await this.deps.abandon();
        return;
      }
      await this.deps.finish();
      await this.deps.textLink("processing");
      return;
    }
    if (was === "drafting") await this.deps.textLink("processing");
    if (was === "review") await this.deps.textLink("ready");
  }
}
