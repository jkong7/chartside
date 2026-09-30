import { randomBytes } from "node:crypto";
import { CASES, practiceCase } from "../../engine/practice/cases";
import { normalize } from "../../engine/practice/intent";
import { askPatient, endPractice, newDevice, patientVoice, startPractice, type PracticeSession } from "../practice";
import { audit, type User } from "../repo";
import { sendText } from "./sms";
import type { CallClaims } from "./token";

export interface PracticeLine {
  menu: string;
  limitMs(): number;
  voice(): string | undefined;
  pick(choice: string, owner: boolean): Promise<string | null>;
  ask(text: string): Promise<{ reply: string; ended: boolean }>;
  finish(reason: "done" | "time" | "hangup"): Promise<string>;
}

const SPOKEN = ["chest pain", "abdominal pain", "headache", "diabetes", "low mood", "fever", "back pain", "shortness of breath"];

export const PRACTICE_MENU = `Practice mode. Every patient is fictional. Pick a case. ${CASES.map((c, i) => `${i ? "press" : "Press"} ${i + 1} for ${c.title.toLowerCase()}`).join(", ")}.`;

function publicUrlBase() {
  return (process.env.CHARTSIDE_PUBLIC_URL || `http://localhost:${process.env.PORT || 3100}`).replace(/\/$/, "");
}

export function pickCase(choice: string) {
  const d = choice.trim();
  if (/^[1-9]$/.test(d)) return CASES[Number(d) - 1] ?? null;
  const t = normalize(d);
  const i = SPOKEN.findIndex((w) => t.includes(` ${w}`));
  if (i >= 0) return CASES[i] ?? null;
  const n = /\b(one|two|three|four|five|six|seven|eight)\b/.exec(t);
  return n ? CASES[["one", "two", "three", "four", "five", "six", "seven", "eight"].indexOf(n[1])] ?? null : null;
}

export function practiceLine(claims: CallClaims, user: User): PracticeLine {
  const actor = { device: newDevice(), userId: null as string | null };
  let owner = false;
  let session: PracticeSession | null = null;
  const token = randomBytes(18).toString("base64url");
  return {
    menu: PRACTICE_MENU,
    limitMs: () => (session?.timeLimitS ?? 720) * 1000,
    voice: () => (session ? patientVoice(practiceCase(session.caseId)!) : undefined),
    pick: async (choice, verified) => {
      const c = pickCase(choice);
      if (!c) return null;
      owner = verified;
      actor.userId = verified && !user.guestUntil ? user.id : null;
      session = await startPractice({ caseId: c.id, actor, channel: "phone", claimToken: token });
      await audit.log(user, null, "phone.practice_started", { callSid: claims.callSid, caseId: c.id, sim: claims.sim, owner });
      const who = c.patient.speaker ? `${c.patient.speaker.name}, the ${c.patient.speaker.relation} of ${c.patient.name}, who is 18 months old` : `${c.patient.name}, ${c.patient.age} years old`;
      return `${c.title}. You're in the ${c.door.setting.toLowerCase()} with ${who}. Take a history. To examine, name what you'd check, such as the heart or lungs. You have ${Math.round(session.timeLimitS / 60)} minutes. Say end encounter, or press 5, when you're done. Go ahead and introduce yourself.`;
    },
    ask: async (text) => {
      if (!session) return { reply: "Pick a case first.", ended: false };
      const r = await askPatient(session.id, actor, { text });
      session = r.session;
      if (r.ended) return { reply: "", ended: true };
      const reply = r.added.filter((t) => t.role !== "student").map((t) => (t.role === "exam" ? `Exam finding: ${t.text}` : t.text)).join(" ");
      return { reply: reply || "Sorry, could you say that again?", ended: false };
    },
    finish: async (reason) => {
      if (!session) return "Okay. Goodbye.";
      const s = await endPractice(session.id, actor);
      session = s;
      const g = s.grade!;
      const missed = g.missedRedFlags.length;
      const url = `${publicUrlBase()}/api/practice/open?s=${encodeURIComponent(s.id)}&k=${encodeURIComponent(token)}`;
      const skip = !owner ? "unverified" : null;
      let texted = false;
      if (!skip) {
        try {
          await sendText(claims.phone, `Chartside Practice: your practice case is scored. Write your note and see your scorecard: ${url}`, "practice_score");
          texted = true;
        } catch (err) {
          console.error("practice text failed", err instanceof Error ? err.message : err);
        }
      }
      await audit.log(user, null, "phone.practice_ended", { callSid: claims.callSid, reason, texted, skipped: skip, score: s.score });
      const head = reason === "time" ? "Time's up." : "Encounter over.";
      const flags = missed ? ` You missed ${missed} red flag${missed === 1 ? "" : "s"}, including ${g.missedRedFlags[0].label.toLowerCase()}.` : " You didn't miss any red flags.";
      return `${head} You covered ${g.historyHits} of ${g.historyTotal} history items.${flags} ${texted ? "I'm texting you a link to write your note and see your full scorecard." : skip === "unverified" ? "To get your scorecard by text, call back and enter your phone PIN first." : "Open Chartside Practice to see your scorecard."} Goodbye.`;
    },
  };
}
