import { dial } from "../tests/e2e/fake-twilio.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "1"]));
const base = args.base || "http://localhost:3100";
const script = args.script ? JSON.parse(args.script) : [{ waitPrompts: 1 }, { digit: "2" }, { waitPrompts: 2 }, { wav: "tests/e2e/fixtures/visit.wav" }, { say: "Chartside, end visit." }, { waitPrompts: 4, timeoutMs: 120000 }, { say: "Ready." }, { waitClose: true, timeoutMs: 30000 }];
const out = await dial({ base, sim: !!args.sim, from: args.from, cookie: args.cookie, twilioToken: process.env.TWILIO_AUTH_TOKEN, deepgramKey: process.env.DEEPGRAM_API_KEY, mockDeepgram: args.mock, steps: script, log: (m) => console.log(m) });
console.log(JSON.stringify(out));
if (out.inboxKey) {
  await new Promise((r) => setTimeout(r, 1500));
  const r = await fetch(`${base}/api/voice/sim/messages?key=${encodeURIComponent(out.inboxKey)}`);
  console.log(JSON.stringify(await r.json(), null, 2));
}
