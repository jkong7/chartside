import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "../db";
import { sealBytes, unsealBytes } from "../fhir/crypto";
import { practiceCase } from "../engine/practice/cases";
import { envCount, patientVoice, spendSession, type PracticeSession } from "./practice";
import { spendDaily } from "./ratelimit";
import { synthesize } from "./telephony/speech";

export class VoiceBusy extends Error {}

function clipPath(sessionId: string, turnId: string) {
  return path.join(dataDir(), "practice-voice", sessionId.replace(/[^a-z0-9_]/gi, ""), `${turnId.replace(/[^a-z0-9]/gi, "")}.enc`);
}

export async function patientClip(s: PracticeSession, turnId: string) {
  const turn = s.turns.find((t) => t.id === turnId && t.role === "patient");
  if (!turn) return null;
  const file = clipPath(s.id, turn.id);
  try {
    return unsealBytes(readFileSync(file));
  } catch {
    if (!(await spendSession(s.id, "voice_clips", envCount("CHARTSIDE_PRACTICE_VOICE_PER_SESSION", 80)))) throw new VoiceBusy("This case has used up its patient voice. The replies are still in the transcript.");
    if (!(await spendDaily("practice-voice", envCount("CHARTSIDE_PRACTICE_VOICE_DAILY", 20000)))) throw new VoiceBusy("The patient voice is busy today. The replies are still in the transcript.");
  }
  const audio = await synthesize(turn.text.slice(0, 600), undefined, "en", patientVoice(practiceCase(s.caseId)!));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, sealBytes(audio), { mode: 0o600 });
  return audio;
}
