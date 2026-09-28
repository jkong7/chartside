"use client";

import { useState } from "react";
import { api } from "@/lib/client";

export default function SurveyPrompt() {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState<string | null>(null);
  if (done) return <div className="mx-auto max-w-5xl px-4 pb-6 md:px-8"><p className="card px-4 py-3 text-sm text-ink-2" data-testid="survey-done">{done}</p></div>;
  return (
    <section className="mx-auto max-w-5xl px-4 pb-6 md:px-8" data-testid="survey">
      <div className="card p-4">
        <p className="text-sm font-medium">How likely are you to recommend Chartside to a colleague?</p>
        <div className="mt-3 flex flex-wrap gap-1" role="radiogroup" aria-label="Score from 0 to 10">
          {Array.from({ length: 11 }, (_, i) => (
            <button key={i} role="radio" aria-checked={score === i} className={`h-8 w-8 rounded-md border text-sm ${score === i ? "border-brand bg-brand text-white" : "border-line hover:bg-sunken"}`} onClick={() => setScore(i)} data-testid={`survey-${i}`}>{i}</button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-ink-4 sm:w-[372px]"><span>Not likely</span><span>Very likely</span></div>
        {score !== null && <textarea className="input mt-3 text-sm" rows={2} placeholder={score >= 9 ? "What do you like most?" : "What would make it better?"} value={comment} onChange={(e) => setComment(e.target.value)} data-testid="survey-comment" />}
        <div className="mt-3 flex gap-2">
          <button className="btn-primary" disabled={score === null} onClick={async () => { await api("/survey", { body: { score, comment } }); setDone("Thanks. Your feedback goes straight to your organization's admins and the Chartside team."); }} data-testid="survey-submit">Send</button>
          <button className="btn-ghost" onClick={async () => { await api("/survey", { body: { action: "snooze" } }); setDone("We'll ask again next week."); }} data-testid="survey-later">Not now</button>
        </div>
      </div>
    </section>
  );
}
