# Chartside Practice

Branch `interface/practice`. Research: `docs/research/_raw-new-interfaces-2.md` (idea #2, "Call your standardized patient") and `docs/research/_raw-niches-2.md` (#2, "Rounds Line").

## The bet

A free, viral funnel for medical students and residents. A student talks to an AI standardized patient, writes the note, and gets a scorecard they can share. Other OSCE tools simulate the patient. None grade both the interview and the note, compare the note with what a scribe would write, and let you present to an attending. Every patient is fictional, so a scorecard carries no patient data and can go in a class group chat. Students become residents, and residents become buyers of the Line.

## The flow

1. **Landing, `/practice`.** Case picker (8 cases), how it works, recent scores for this browser, a class code box, and a pointer to the phone line. The main landing page links here ("Med student or resident?").
2. **Door, `/practice/[caseId]`.** Door information (setting, vitals, task), an optional first name, an optional class code, and a timer (8, 12 or 15 minutes). No account.
3. **Encounter.** A chat-style transcript with live captions. The student types, or taps the mic and talks (Deepgram live transcription through a practice-only token, or the browser's own speech recognition when Deepgram isn't set up). When the mic is on, the patient answers aloud in an Aura voice matched to the character. "Examine" buttons (listen to heart, press on belly, and so on) reveal findings. Saying "I'd like to listen to your heart" works too. A countdown ends the encounter at zero. "End encounter" or saying "end encounter" also ends it. A reload resumes the same session.
4. **Note.** A SOAP editor (S/O/A/P prefilled) with dictation, "Grade my encounter and note", or "Skip the note".
5. **Scorecard, `/practice/s/[id]`.** Score ring, History / Physical exam / Communication / Note bars, 3 timestamped fixes (the owner's timestamps jump to that moment in the transcript), missed red flags, share and "Challenge a friend", the full rubric with times, "Your note vs how Chartside would chart it", the attending, save progress, and the transcript. Visitors see a public view: score, fixes, red flags, and "Take the challenge". They never see the transcript or the note.
6. **Attending mode.** The student presents orally (typed or out loud). It is graded out of 10 on opening with age and chief complaint, standard order, pertinent positives and negatives, committing to a leading diagnosis, a specific plan, and length. Then the attending asks 3 questions, graded by key concept, with the model answer shown.
7. **Save progress.** An email and a 6-digit code (the existing magic sign-in), which then claims every session from this browser. A `.edu` email adds a Student badge. Signing in any other way auto-claims on the next scorecard visit.
8. **Class codes, `/practice/c/[code]`.** Best score per person per case, first names only.
9. **The phone line.** A first-time caller hears "Medical student? Press 7 to practice a case with a fictional patient." Pressing 7 (or saying "practice") reads a menu. The caller picks a case by number or by name, takes the history hands-free, and asks for exam findings by voice. "End encounter" or 5 ends it, as does the timer or hanging up. The line reads back how many history items were covered and the top missed red flag, then texts a PHI-free link (`/api/practice/open?s=…&k=…`) that opens the scorecard in the browser, where the caller writes the note.

## How it works

- **Case library, `src/lib/engine/practice/cases/*`.** Chest pain, abdominal pain, headache, diabetes follow-up, low mood (depression screen with a safety assessment), fever in a toddler (you talk to the mother), low back pain, and shortness of breath. Each case has a persona (name, age, affect, opening line, story), hidden facts keyed by topic, case-specific topic keywords, emotional cues, exam maneuvers with findings, a weighted history checklist with red flags and a model question for each, note facts (positives, negatives, history, exam) with keyword sets, a differential with one leading diagnosis, plan items, contradictions, 3 attending questions, and a model presentation.
- **Intent matching, `intent.ts`.** A deterministic lexicon maps a question to topics (OPQRST, history, social, ROS, communication moves such as introduction, open-ended question, empathy, concerns, summary, next steps), plus exam requests and "end encounter".
- **Standardized patient, `patient.ts`.** Offline and deterministic: it answers only the topics asked, in character, up to 3 facts per turn. An open question gets the opening line, then the story. Unasked symptoms default to a plain denial. The patient never volunteers red flags. With `ANTHROPIC_API_KEY` set (and `CHARTSIDE_ENGINE` not `local`), Claude plays the patient from the same persona and hidden facts, told to answer only what's asked and stay in character (`playPatientWithClaude` in `llm.ts`). It falls back to the offline patient on error or past the daily cap. Grading always uses the deterministic topic match, so scores are stable either way.
- **Grading, `grade.ts`.** History, exam and communication are the weighted share of items hit. The note gets 40 points for documenting what was actually elicited, 30 for the differential (20 for the leading diagnosis), and 30 for the plan, minus 5 for each finding charted but never asked or examined, and for each contradiction (capped at 20). The overall score weights History 40, Exam 10, Communication 20 and Note 30, and renormalizes without a note. Fixes are prioritized: missed red flags, a missed emotional cue, a closed opening, invented findings, a missing leading diagnosis, skipped exams, no summary, plan gaps, and no introduction.
- **How Chartside would chart it, `reference.ts`.** The transcript becomes utterances (student as clinician, exam findings as "On exam, …"), and the real note engine writes a SOAP note: `extractFacts` and `buildNote` offline, or `generateNoteWithClaude` when Claude is on. It is graded with the same rubric so the student sees Chartside's score.
- **Server, `src/lib/server/practice.ts`.** The `practice_sessions` table holds turns, note, grade, reference note, presentation, cohort, owner (an httpOnly `cs_prac` browser cookie, or a user id once claimed), and a hashed claim token for phone sessions. The API lives under `/api/practice/*`: start, turn, end, note, present, pimp, speak, speech, claim and open. The phone runs through `src/lib/server/telephony/practice.ts` and a `practice` state in `call.ts`.

## Safety and privacy

- Every patient is fictional, and every practice page says so. No real patient data is ever asked for, and nothing from practice touches encounters, notes, or the consent ledger.
- The phone path records nothing. It never opens a capture and keeps no audio. Only the transcript text of the practice conversation is stored.
- The scorecard text goes through `sendText`, which refuses anything that looks like PHI. It deliberately names no case ("your practice case is scored").
- The public scorecard and `GET /api/practice/[id]` for non-owners return only the score card: first name, scores, fixes and red flags. No transcript, no note.
- Leaderboards show first names only, cleaned to letters.
- Rate limits: session starts, turns, voice clips, speech tokens and grading are limited per IP. A daily global cap limits Claude calls. Sessions can hold at most 160 turns. The server ends an encounter 30 seconds past its time limit even if the browser doesn't.
- Signing in to save progress reuses the single-use magic codes, including SSO enforcement and MFA.

## Tests

- **Unit, 34 new** in `tests/unit/practice.test.ts`, `practice-server.test.ts` and `telephony-practice.test.ts`. They cover the case library's completeness; that every checklist question and exam request in every case is answered and credited; intent matching; offline patient behavior (no volunteering, the parent persona, exam findings, defaults, determinism); exact grading math, fixes and timestamps; attending and pimp grading; the reference note; sessions end to end; the time limit; claim and the `.edu` badge; leaderboards; the phone claim token; and the phone state machine (keypad, voice, end, hang-up, time-up).
- **E2E, 10 new** in `tests/e2e/practice.spec.ts`. They cover landing to scorecard by typing; a voice interview with the fake mic and mock Deepgram, with patient TTS and note dictation; the timer; the public share view, OG image and challenge link; the class leaderboard; the attending by voice with pimp questions; save progress with an emailed code and the Student badge; ownership and input checks; the phone line (press 7, voice history, exam by voice, end, PHI-free text, link to scorecard, note); and axe WCAG 2.1 AA on every practice page. The mock Deepgram gained practice scripts, one each for the encounter, the note and the presentation.
- The full unit suite (402 tests) passed. See the final report for the full e2e run.

## What's left

- Live check with real Claude and Deepgram. Claude's patient quality is untested beyond the prompt. The offline patient is what the tests cover.
- The offline reference note is only as good as the on-device engine. It can pick up a problem the student merely asked about (for example "Do you have diabetes?"). With Claude on, this goes away.
- The phone line's echo guard can drop a student's recap if it repeats the patient's words almost exactly.
- Attending mode is browser-only. A phone "present to the attending" number (the Rounds Line idea) is not built.
- No case authoring UI. Cases are code. Educators can't upload their own yet, and nothing is sold to schools (FERPA would apply).
- The Student badge trusts any `.edu` email. There's no residency or NPI upgrade path from practice to the real Line beyond the link.
