import { writeFileSync } from "node:fs";

const KEY = process.env.DEEPGRAM_API_KEY;
if (!KEY) throw new Error("Set DEEPGRAM_API_KEY");
const DOC = "aura-2-orion-en";
const PT = "aura-2-thalia-en";
const LINES = [
  [DOC, "Hi Maria, good to see you again. How have things been since we started the metformin?"],
  [PT, "Pretty good, honestly. My stomach was upset the first week, but that's gone now."],
  [DOC, "Good. Are you taking it with dinner like we talked about?"],
  [PT, "Yes, five hundred milligrams with dinner, every night. I haven't missed any."],
  [DOC, "And your home sugars?"],
  [PT, "Mornings are usually around one twenty, one thirty. It used to be over one eighty."],
  [DOC, "That's a real improvement. Any dizziness, shaky spells, or sweating?"],
  [PT, "No, nothing like that. I've been walking after dinner too, about twenty minutes."],
  [DOC, "Great. Your blood pressure today is one twenty eight over seventy eight, and your weight is down four pounds. Your A one C from last week came back at seven point one, down from eight point four."],
  [PT, "Oh wow, that's good news."],
  [DOC, "It is. Your feet look good, pulses are normal, and sensation is intact. Any numbness or tingling?"],
  [PT, "No."],
  [DOC, "Okay. So your diabetes is improving on metformin. Let's go up to one thousand milligrams with dinner, since you're tolerating it well. Keep walking. Your blood pressure is at goal, so we'll keep the lisinopril at ten milligrams."],
  [DOC, "I also want to get your eye exam scheduled, since it's been over a year, and we'll recheck the A one C in three months."],
  [PT, "Sounds good. Should I keep checking my sugar every morning?"],
  [DOC, "A few times a week is fine now. Call us if you see anything under seventy or over two fifty. Let's see you back in three months."],
];

const silence = (s) => Buffer.alloc(Math.round(8000 * s), 0xff);
const parts = [silence(0.6)];
for (const [voice, text] of LINES) {
  const r = await fetch(`https://api.deepgram.com/v1/speak?model=${voice}&encoding=mulaw&sample_rate=8000&container=none`, { method: "POST", headers: { Authorization: `Token ${KEY}`, "content-type": "application/json" }, body: JSON.stringify({ text }) });
  if (!r.ok) throw new Error(`tts ${r.status} ${await r.text()}`);
  parts.push(Buffer.from(await r.arrayBuffer()), silence(voice === DOC ? 0.55 : 0.45));
}
const all = Buffer.concat(parts);
writeFileSync("public/demo/sample-visit.ulaw", all);
console.log(`wrote ${all.length} bytes, ${(all.length / 8000).toFixed(1)} s`);
