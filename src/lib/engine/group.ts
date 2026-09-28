import type { Utterance } from "../types";

export interface GroupMember {
  id: string;
  name: string;
}

const GROUP_WIDE = /\b(?:everyone|everybody|all of you|as a group|the group|y'all|for all of you|welcome|today's topic|today we(?:'re| are| will|'ll)|this week(?:'s)? homework|homework this week)\b/i;

const first = (name: string) => name.trim().split(/\s+/)[0];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function addressee(text: string, members: GroupMember[]) {
  const hits = members.filter((m) => new RegExp(`(?:^|[,.?!]\\s*|\\b(?:you|about you|thanks|thank you|and),?\\s+)${esc(first(m.name))}\\b|\\b${esc(first(m.name))}\\s*[,?]`, "i").test(text));
  return hits.length === 1 ? hits[0].id : null;
}

function selfIntro(text: string, members: GroupMember[]) {
  const m = /\b(?:I'm|I am|my name is|this is)\s+([A-Z][a-z]+)\b/.exec(text);
  return m ? members.find((x) => first(x.name).toLowerCase() === m[1].toLowerCase())?.id ?? null : null;
}

export function guessAssignments(utts: Utterance[], members: GroupMember[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  let current: string | null = null;
  for (const u of utts) {
    if (u.speaker === "clinician") {
      const to = addressee(u.text, members);
      if (to) current = to;
      else if (GROUP_WIDE.test(u.text)) current = null;
      continue;
    }
    const intro = selfIntro(u.text, members);
    if (intro) current = intro;
    out[u.id] = current;
  }
  return out;
}

export function clinicianScope(u: Utterance, members: GroupMember[], owner: string | null): "group" | string | null {
  const to = addressee(u.text, members);
  if (to) return to;
  if (GROUP_WIDE.test(u.text)) return "group";
  return owner;
}

export function memberTranscript(utts: Utterance[], assignments: Record<string, string | null>, member: GroupMember, members: GroupMember[]) {
  const others = members.filter((m) => m.id !== member.id);
  const scrub = (t: string) => others.reduce((s, m) => s.replace(new RegExp(`\\b${esc(m.name)}\\b`, "gi"), "another member").replace(new RegExp(`\\b${esc(first(m.name))}\\b`, "gi"), "another member"), t);
  const out: { speaker: Utterance["speaker"]; text: string; tStart: number; tEnd: number }[] = [];
  let owner: string | null = null;
  utts.forEach((u, i) => {
    if (u.speaker === "clinician") {
      const next = utts.slice(i + 1).find((x) => x.speaker !== "clinician");
      const scope = clinicianScope(u, members, next ? assignments[next.id] ?? null : owner);
      if (scope !== "group" && scope !== null) owner = scope;
      if (scope === "group" || scope === member.id) out.push({ speaker: "clinician", text: scrub(u.text), tStart: u.tStart, tEnd: u.tEnd });
      return;
    }
    if (assignments[u.id] === member.id) out.push({ speaker: "patient", text: scrub(u.text), tStart: u.tStart, tEnd: u.tEnd });
  });
  return out;
}

export function groupTopic(utts: Utterance[]) {
  for (const u of utts) {
    if (u.speaker !== "clinician") continue;
    const m = /\b(?:today's topic is|today we(?:'re| are) (?:talking|going to talk|focusing|working) (?:about|on)|this week's topic is)\s+([^.?!]+)/i.exec(u.text);
    if (m) return { text: m[1].trim(), evidence: [u.id] };
  }
  return null;
}

export function participationCounts(utts: Utterance[], assignments: Record<string, string | null>, members: GroupMember[]) {
  return members.map((m) => ({ id: m.id, name: m.name, lines: utts.filter((u) => assignments[u.id] === m.id).length }));
}
