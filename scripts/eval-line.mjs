import { dial } from "../tests/e2e/fake-twilio.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "")).map((a) => (a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, "1"])));
const base = args.base || "http://localhost:3100";
const only = args.only ? args.only.split(",") : null;
const cookie = args.cookie;
const pin = args.pin || "";
const sample = args.sample || "public/demo/sample-visit.ulaw";
if (!process.env.DEEPGRAM_API_KEY) throw new Error("Set DEEPGRAM_API_KEY so the caller can speak");

const PT = "aura-2-estrella-es";
const pinSteps = pin ? [...pin.split("").map((d) => ({ digit: d })), { digit: "#" }] : [];

const SCENARIOS = [
  {
    id: "consent_chatter",
    why: "Questions and small talk must not start a recording; an explicit yes must.",
    steps: [{ waitPrompts: 1, timeoutMs: 40000 }, { say: "Is it okay if I record our visit today?" }, { say: "Okay, have a seat." }, { say: "She agreed." }, { waitPrompts: 2, timeoutMs: 40000 }, { hangup: true }],
    expect: (t) => t.at("heard", "have a seat") >= 0 && t.at("heard", "she agreed") > t.at("heard", "have a seat") && t.at("state", "recording") > t.at("heard", "she agreed"),
  },
  {
    id: "full_visit",
    why: "A whole visit by voice: consent, sample visit, end command, read-back, ready, text.",
    steps: [{ waitPrompts: 1, timeoutMs: 40000 }, { say: "They agreed." }, { waitPrompts: 2, timeoutMs: 40000 }, { ulaw: sample }, { say: "Chartside, end visit." }, { waitState: "review", timeoutMs: 180000 }, { sleep: 1500 }, { waitQuiet: true }, { say: "Ready." }, { waitClose: true, timeoutMs: 40000 }],
    expect: (t) => t.said.some((s) => s.startsWith("Here's your note.")) && t.states.at(-1) === "ended" && t.texts.some((m) => /note from the .* call is ready/.test(m)),
  },
  {
    id: "split_wake",
    why: "A pause between the wake word and the command still ends the visit.",
    steps: [{ waitPrompts: 1, timeoutMs: 40000 }, { digit: "2" }, { waitPrompts: 2, timeoutMs: 40000 }, { ulaw: sample, seconds: 20 }, { say: "Chartside," }, { silence: 1 }, { say: "end visit." }, { waitPrompts: 3, timeoutMs: 40000 }, { hangup: true }],
    expect: (t) => t.states.includes("drafting"),
  },
  {
    id: "pause_resume",
    why: "Spoken pause and resume change state and nothing is kept while paused.",
    steps: [{ waitPrompts: 1, timeoutMs: 40000 }, { digit: "2" }, { waitPrompts: 2, timeoutMs: 40000 }, { silence: 2 }, { say: "Chartside, pause." }, { waitPrompts: 3, timeoutMs: 30000 }, { silence: 3 }, { say: "Chartside, resume." }, { waitPrompts: 4, timeoutMs: 30000 }, { hangup: true }],
    expect: (t) => t.states.includes("paused") && t.states.lastIndexOf("recording") > t.states.indexOf("paused"),
  },
  {
    id: "declined",
    why: "A clear decline hangs up and keeps nothing.",
    steps: [{ waitPrompts: 1, timeoutMs: 40000 }, { say: "The patient declined." }, { waitClose: true, timeoutMs: 30000 }],
    expect: (t) => t.said.some((s) => s.startsWith("Understood. Nothing was recorded")) && !t.states.includes("recording"),
  },
  {
    id: "spanish_consent",
    why: "Press 9, the patient answers in Spanish, recording starts.",
    steps: [{ waitPrompts: 1, timeoutMs: 40000 }, { digit: "9" }, { waitPrompts: 2, timeoutMs: 40000 }, { say: "Sí, está bien.", voice: PT }, { waitPrompts: 3, timeoutMs: 40000 }, { hangup: true }],
    expect: (t) => t.states.includes("recording"),
  },
  {
    id: "ask_patient_no",
    why: "Press 3, the patient says no, the call ends with nothing kept.",
    steps: [{ waitPrompts: 1, timeoutMs: 40000 }, { digit: "3" }, { waitPrompts: 2, timeoutMs: 40000 }, { say: "No, I'd rather not.", voice: "aura-2-thalia-en" }, { waitClose: true, timeoutMs: 30000 }],
    expect: (t) => t.said.some((s) => s.startsWith("Understood. Nothing was recorded")),
  },
  {
    id: "chart_question",
    why: "With a PIN, a question addressed to Chartside gets a spoken answer. Needs --cookie and --pin.",
    needsPin: true,
    steps: [{ waitPrompts: 1, timeoutMs: 40000 }, ...pinSteps, { waitPrompts: 2, timeoutMs: 40000 }, { say: "Chartside, what's left on my plate today?" }, { waitPrompts: 3, timeoutMs: 60000 }, { hangup: true }],
    expect: (t) => t.said.length >= 3 && !t.said.at(-1).startsWith("I can answer questions about your chart once"),
  },
];

const results = [];
for (const s of SCENARIOS) {
  if (only && !only.includes(s.id)) continue;
  if (s.needsPin && (!cookie || !pin)) {
    results.push({ id: s.id, status: "skipped", why: "needs --cookie and --pin" });
    continue;
  }
  const said = [];
  const heard = [];
  const states = [];
  const timeline = [];
  const t0 = Date.now();
  let error = null;
  let out = null;
  const steps = s.steps;
  try {
    out = await dial({
      base,
      sim: true,
      cookie: s.needsPin ? cookie : undefined,
      deepgramKey: process.env.DEEPGRAM_API_KEY,
      steps,
      log: (m) => {
        if (m.startsWith("said: ")) said.push(m.slice(6));
        else if (m.startsWith("heard: ")) heard.push(m.slice(7));
        else if (m.startsWith("state: ")) states.push(m.slice(7));
        const kind = m.slice(0, m.indexOf(":"));
        if (["said", "heard", "state"].includes(kind)) timeline.push({ kind, text: m.slice(kind.length + 2).toLowerCase() });
      },
    });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  let texts = [];
  if (out?.inboxKey) {
    await new Promise((r) => setTimeout(r, 2500));
    const r = await fetch(`${base}/api/voice/sim/messages?key=${encodeURIComponent(out.inboxKey)}`).catch(() => null);
    texts = r?.ok ? (await r.json()).messages.map((m) => m.body) : [];
  }
  const t = {
    said,
    heard,
    states,
    texts,
    at: (kind, text) => timeline.findIndex((e) => e.kind === kind && (kind === "state" ? e.text === text : e.text.includes(text))),
  };
  let pass = false;
  try {
    pass = !error && !!s.expect(t);
  } catch {
    pass = false;
  }
  results.push({ id: s.id, status: pass ? "pass" : "fail", seconds: Math.round((Date.now() - t0) / 1000), error, states: states.join(" > "), heard: heard.slice(-3), lastSaid: said.at(-1)?.slice(0, 120) });
  console.log(`${pass ? "PASS" : "FAIL"} ${s.id} (${Math.round((Date.now() - t0) / 1000)}s) ${error ?? ""}`);
}
console.log(JSON.stringify(results, null, 2));
process.exit(results.some((r) => r.status === "fail") ? 1 : 0);
