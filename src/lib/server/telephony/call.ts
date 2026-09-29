import { affirmative, negative, reviewIntent, wakeCommand } from "./intents";

export type CallState = "greeting" | "confirmPatient" | "consent" | "recording" | "paused" | "drafting" | "review" | "ended";

export interface NextVisit {
  encounterId: string;
  spoken: string;
}

export interface NoteBrief {
  spoken: string;
}

export interface CallDeps {
  say(text: string): Promise<void>;
  hangup(): void;
  caller: { name: string | null; guest: boolean };
  nextVisit(): Promise<NextVisit | null>;
  open(input: { encounterId?: string }): Promise<void>;
  flush(): Promise<void>;
  finish(): Promise<void>;
  waitForNote(): Promise<NoteBrief | null>;
  converse(text: string): Promise<string>;
  markReady(): Promise<void>;
  textLink(reason: "ready" | "processing"): Promise<void>;
  declined(): Promise<void>;
  log(event: string, data?: Record<string, unknown>): void;
}

export const LINES = {
  consentAsk:
    "Please ask your patient now: I use an AI assistant that listens and drafts my note, so I can focus on you. I review everything, and the recording is deleted after. Is that okay? When they agree, say they agreed, or press 2. If they'd rather not, say no, or press 0.",
  recording: "Thanks. I'm listening and I'll stay quiet. Say Chartside, pause, or Chartside, end visit, any time. Or just hang up when you're done.",
  paused: "Paused. Nothing is being recorded. Say Chartside, resume, or press 2 to keep going.",
  resumed: "Listening again.",
  drafting: "Got it. Writing your note now. Stay on the line to hear it, or hang up and I'll text you when it's ready.",
  declined: "Understood. Nothing was recorded. You can call back any time. Goodbye.",
  reviewPrompt: "Say ready, and I'll put it at the top of your stack to sign. Tell me anything to change. Or hang up, and I'll text you the link.",
  ready: "Done. It's at the top of your stack. I'm texting you the link to review and sign. Goodbye.",
  later: "Okay. I'm texting you the link now. Goodbye.",
  slow: "This one is taking longer than usual. I'll text you as soon as it's ready. Goodbye.",
  anythingElse: "Anything else? Say ready when it looks right.",
  notHeard: "Sorry, I didn't catch that.",
} as const;

export class ScribeCall {
  state: CallState = "greeting";
  private busy = false;
  private hasAudio = false;
  private lastSpoken = "";
  private reviewTurns = 0;
  private pendingVisit: NextVisit | null = null;

  constructor(private deps: CallDeps) {}

  get capturing() {
    return this.state === "recording";
  }

  async start() {
    const who = this.deps.caller.guest ? "" : this.deps.caller.name ? ` ${this.deps.caller.name}` : "";
    const intro = this.deps.caller.guest
      ? "Hi, this is Chartside, an AI scribe, on a recorded line. I'll write the note for your next visit. It's free, and there's nothing to sign up for."
      : `Hi${who}. This is your Chartside scribe, on a recorded line.`;
    const next = this.deps.caller.guest ? null : await this.deps.nextVisit().catch(() => null);
    if (next) {
      this.pendingVisit = next;
      this.state = "confirmPatient";
      await this.say(`${intro} ${next.spoken} Is that who you're seeing?`);
      return;
    }
    this.state = "consent";
    await this.say(`${intro} ${LINES.consentAsk}`);
  }

  private async say(text: string) {
    this.lastSpoken = text;
    await this.deps.say(text);
  }

  async onTranscript(text: string) {
    if (!text.trim() || this.busy || this.state === "ended") return;
    this.busy = true;
    try {
      await this.handleTranscript(text);
    } finally {
      this.busy = false;
    }
  }

  private async handleTranscript(text: string) {
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
        if (negative(text)) return this.decline();
        if (affirmative(text)) return this.beginRecording();
        return;
      }
      case "recording":
      case "paused": {
        const cmd = wakeCommand(text);
        if (cmd === "pause" && this.state === "recording") return this.pause();
        if (cmd === "resume" && this.state === "paused") return this.resume();
        if (cmd === "end") return this.endVisit();
        return;
      }
      case "review": {
        const intent = reviewIntent(text);
        if (intent.kind === "repeat") return this.say(this.lastSpoken);
        if (intent.kind === "ready") {
          await this.deps.markReady();
          await this.deps.textLink("ready");
          await this.say(LINES.ready);
          return this.close();
        }
        if (intent.kind === "later") {
          await this.deps.textLink("ready");
          await this.say(LINES.later);
          return this.close();
        }
        this.reviewTurns++;
        const reply = await this.deps.converse(intent.text).catch(() => "Sorry, I couldn't do that one. You can change it when you review the note.");
        await this.say(`${reply} ${this.reviewTurns === 1 ? LINES.anythingElse : ""}`.trim());
        return;
      }
    }
  }

  async onDigit(d: string) {
    if (this.busy || this.state === "ended") return;
    this.busy = true;
    try {
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
        if (d === "5" || d === "#") return await this.handleTranscript("text me");
      }
    } finally {
      this.busy = false;
    }
  }

  onAudio() {
    if (this.state === "recording") this.hasAudio = true;
  }

  private async beginRecording() {
    await this.deps.open({ encounterId: this.pendingVisit?.encounterId });
    this.deps.log("call.consent_granted", { scheduled: !!this.pendingVisit });
    await this.say(LINES.recording);
    this.state = "recording";
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
    await this.say(LINES.resumed);
    this.state = "recording";
    this.deps.log("call.resumed");
  }

  private async endVisit() {
    this.state = "drafting";
    await this.say(LINES.drafting);
    await this.deps.finish();
    const note = await this.deps.waitForNote();
    if (this.state !== "drafting") return;
    if (!note) {
      await this.deps.textLink("processing");
      await this.say(LINES.slow);
      return this.close();
    }
    this.state = "review";
    await this.say(`${note.spoken} ${LINES.reviewPrompt}`);
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
      if (!this.hasAudio) return;
      await this.deps.finish();
      await this.deps.textLink("processing");
      return;
    }
    if (was === "drafting") await this.deps.textLink("processing");
    if (was === "review") await this.deps.textLink("ready");
  }
}
