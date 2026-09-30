import { COMMUNICATION, examRequest, matchTopics, ROS_TOPICS } from "./intent";
import type { ExamManeuver, PracticeCase, Turn } from "./types";

export interface PatientReply {
  text: string;
  topics: string[];
  exams: ExamManeuver[];
  cue: boolean;
}

const COMM = new Set<string>(COMMUNICATION);

const ALIASES: Record<string, string[]> = { feeding: ["appetite", "diet"], appetite: ["feeding"], diet: ["feeding"], diapers: ["urinary"], urinary: ["diapers"], exercise_hx: ["occupation"], chest_pain: ["character"] };

export function factFor(c: PracticeCase, topic: string) {
  return c.facts[topic] ?? (ALIASES[topic] ?? []).map((a) => c.facts[a]).find(Boolean) ?? null;
}

export function firstName(c: PracticeCase) {
  return (c.patient.speaker?.name ?? c.patient.name).split(" ")[0];
}

export function speakerLabel(c: PracticeCase) {
  return c.patient.speaker ? `${firstName(c)} (${c.patient.speaker.relation})` : firstName(c);
}

export function fallbackAnswer(topic: string) {
  return ROS_TOPICS.has(topic) ? "No, nothing like that." : "No, I don't think so.";
}

function greeting(c: PracticeCase, history: Turn[]) {
  if (history.some((t) => t.role === "patient")) return "";
  return c.patient.speaker ? `Hi. I'm ${c.patient.speaker.name.split(" ")[0]}, ${c.patient.name.split(" ")[0]}'s ${c.patient.speaker.relation === "mother" ? "mom" : c.patient.speaker.relation}.` : "Hi.";
}

export function studentTopics(c: PracticeCase, text: string) {
  const exams = examRequest(text, c);
  const topics = matchTopics(text, c);
  return { exams, topics: exams.length || topics.includes("summary") ? topics.filter((t) => COMM.has(t)) : topics };
}

export function respond(c: PracticeCase, question: string, history: Turn[]): PatientReply {
  const { exams, topics } = studentTopics(c, question);
  const hello = topics.includes("greet") || topics.includes("intro") ? greeting(c, history) : "";
  if (exams.length) return { text: [hello, "Okay, go ahead."].filter(Boolean).join(" "), topics, exams, cue: false };
  const content = topics.filter((t) => !COMM.has(t));
  const answers: string[] = [];
  const real = content.filter((t) => factFor(c, t));
  for (const t of real.length ? real : content) {
    const a = factFor(c, t) ?? fallbackAnswer(t);
    if (!answers.includes(a)) answers.push(a);
    if (answers.length >= 3) break;
  }
  let body = answers.join(" ");
  if (!body) {
    const opens = history.filter((t) => t.role === "student" && t.topics?.includes("open")).length;
    if (topics.includes("open")) body = opens === 0 ? c.patient.opening : opens === 1 ? c.patient.story : "That's really the main thing. Ask me anything you need to know.";
    else if (topics.includes("concerns")) body = c.facts.concerns ?? "I just want to feel better.";
    else if (topics.includes("empathy")) body = c.facts.empathy ?? "Thank you.";
    else if (topics.includes("summary")) body = "Yes, that's right.";
    else if (topics.includes("next_steps")) body = c.facts.next ?? "Okay. Thank you.";
    else if (!hello) body = "Sorry, I'm not sure what you mean. Could you ask that another way?";
  }
  const answered = content.length ? content : topics.filter((t) => t === "concerns");
  const cue = answered.some((t) => c.cues?.includes(t)) || (!content.length && topics.includes("open") && history.every((t) => !(t.role === "student" && t.topics?.includes("open"))) && /scared|worried|afraid/i.test(body));
  return { text: [hello, body].filter(Boolean).join(" "), topics, exams, cue };
}
