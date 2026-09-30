import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AttendingMode from "@/components/practice/AttendingMode";
import SaveProgress from "@/components/practice/SaveProgress";
import ScoreRing, { scoreTone } from "@/components/practice/ScoreRing";
import ShareScore from "@/components/practice/ShareScore";
import { Check, X } from "@/components/icons";
import { practiceCase } from "@/lib/engine/practice/cases";
import { clock, type ItemResult } from "@/lib/engine/practice/grade";
import { currentUser } from "@/lib/server/auth";
import { claimPractice, getPractice, owns, publicCard } from "@/lib/server/practice";
import { practiceActor } from "@/lib/server/practiceHttp";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const s = await getPractice((await params).id);
  if (!s || s.score === null) return { title: "Chartside Practice", robots: { index: false } };
  const card = publicCard(s);
  const title = `${card.name ? `${card.name} scored` : "Scored"} ${card.overall} on the ${card.caseTitle.toLowerCase()} case`;
  const description = `History ${card.historyHits}/${card.historyTotal}${card.missedRedFlags.length ? `. Missed: ${card.missedRedFlags.map((m) => m.label.toLowerCase()).slice(0, 2).join(", ")}` : ". No red flags missed"}. Can you beat it? Free practice with an AI patient.`;
  return { title, description, robots: { index: false }, openGraph: { title, description, type: "website" }, twitter: { card: "summary_large_image", title, description } };
}

function Items({ title, items, owner }: { title: string; items: ItemResult[]; owner: boolean }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {items.map((i) => (
          <li key={i.id} className="flex items-start gap-2 text-sm" data-testid="rubric-item" data-hit={i.hit ? "1" : "0"}>
            {i.hit ? <Check size={16} className="mt-0.5 shrink-0 text-ok" /> : <X size={16} className="mt-0.5 shrink-0 text-rec" />}
            <span className="flex-1">
              {i.label}
              {i.redFlag && <span className="pill ml-1.5 bg-rec-50 text-rec">Red flag</span>}
              {!i.hit && <span className="block text-xs text-ink-3">Try: “{i.ask}”</span>}
            </span>
            {i.hit && i.at !== null && (owner && i.turnId ? <a href={`#turn-${i.turnId}`} className="font-mono text-xs text-brand">{clock(i.at)}</a> : <span className="font-mono text-xs text-ink-3">{clock(i.at)}</span>)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function Scorecard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let s = await getPractice(id);
  if (!s || !s.grade) notFound();
  const actor = await practiceActor();
  const user = await currentUser().catch(() => null);
  if (user && !user.guestUntil && actor.device && owns(s, actor) && !s.userId) {
    await claimPractice(actor, user.id);
    s = (await getPractice(id))!;
  }
  const owner = owns(s, { device: actor.device, userId: user && !user.guestUntil ? user.id : null });
  const c = practiceCase(s.caseId)!;
  const card = publicCard(s);
  const g = s.grade!;
  const rival = s.challengeOf ? await getPractice(s.challengeOf) : null;
  const who = c.patient.speaker ? c.patient.speaker.name.split(" ")[0] : c.patient.name.split(" ")[0];
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 pt-2 sm:px-0" data-testid="scorecard" data-owner={owner ? "1" : "0"}>
      <p className="rounded-lg bg-brand-50 px-3 py-2 text-center text-xs text-brand" data-testid="no-phi">Practice case with a fictional patient. No real patient information is on this page.</p>

      <section className="card p-5 sm:p-6">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <ScoreRing score={g.overall} />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-3">{c.specialty}</p>
            <h1 className="mt-1 font-serif text-3xl leading-tight" data-testid="scorecard-title">{c.title}</h1>
            <p className="mt-1 text-sm text-ink-2">
              {card.name ? <span className="font-medium text-ink" data-testid="scorecard-name">{card.name}</span> : "Anonymous"}
              {card.student && <span className="pill ml-2 bg-info-50 text-info" data-testid="student-badge">Student</span>}
              <span className="text-ink-3"> · {card.patient} · {Math.max(1, card.minutes)} min{s.channel === "phone" ? " · by phone" : ""}</span>
            </p>
            <p className="mt-2 text-sm text-ink-2" data-testid="history-count">
              History {card.historyHits}/{card.historyTotal}
              {card.missedRedFlags.length ? <span className="text-rec"> · missed {card.missedRedFlags.length} red flag{card.missedRedFlags.length === 1 ? "" : "s"}</span> : <span className="text-ok"> · no red flags missed</span>}
              {card.presentation && <span> · presentation {card.presentation.score}/10</span>}
            </p>
            {rival && rival.score !== null && (
              <p className="mt-2 text-sm font-medium" data-testid="rival">
                {rival.name || "Your friend"} scored {rival.score}. {g.overall > rival.score ? "You won." : g.overall === rival.score ? "It's a tie." : "Not this time."}
              </p>
            )}
            {s.cohort && <Link href={`/practice/c/${s.cohort}`} className="mt-2 inline-block text-sm text-brand" data-testid="cohort-link">See the {s.cohort} leaderboard</Link>}
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2" data-testid="categories">
          {g.categories.map((cat) => (
            <div key={cat.key} data-testid={`cat-${cat.key}`}>
              <div className="flex justify-between text-sm">
                <span>{cat.label}</span>
                <span className="font-semibold tabular-nums">{cat.score}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-sunken">
                <div className="h-full rounded-full" style={{ width: `${cat.score}%`, background: scoreTone(cat.score) }} />
              </div>
            </div>
          ))}
          {!g.note && <p className="text-sm text-ink-3 sm:col-span-2">No note was graded, so the score covers the encounter only.</p>}
        </div>
      </section>

      {g.fixes.length > 0 && (
        <section className="card p-5" data-testid="fixes">
          <h2 className="font-serif text-2xl">3 things to fix next time</h2>
          <ol className="mt-3 space-y-3">
            {g.fixes.map((f, i) => (
              <li key={i} className="flex gap-3" data-testid="fix">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sunken text-sm font-semibold">{i + 1}</span>
                <div className="min-w-0">
                  <p className="font-medium">
                    {f.title}
                    {f.at !== null && (owner && f.turnId ? <a href={`#turn-${f.turnId}`} className="ml-2 font-mono text-xs text-brand" data-testid="fix-time">{clock(f.at)}</a> : <span className="ml-2 font-mono text-xs text-ink-3" data-testid="fix-time">{clock(f.at)}</span>)}
                  </p>
                  <p className="text-sm text-ink-2">{f.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {g.missedRedFlags.length > 0 && (
        <section className="rounded-xl border border-rec/30 bg-rec-50 p-5" data-testid="red-flags">
          <h2 className="font-semibold text-rec">Missed red flags</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {g.missedRedFlags.map((m) => (
              <li key={m.label}><span className="font-medium">{m.label}.</span> <span className="text-ink-2">Ask: “{m.ask}”</span></li>
            ))}
          </ul>
        </section>
      )}

      {owner ? (
        <section className="card p-5">
          <h2 className="font-semibold">Share your score</h2>
          <p className="mt-1 text-sm text-ink-2">The link shows your score and fixes, never your transcript. Friends who open the challenge link get the same case.</p>
          <div className="mt-3">
            <ShareScore path={`/practice/s/${s.id}`} challengePath={`/practice/${c.id}?challenge=${s.id}`} retryPath={`/practice/${c.id}`} score={g.overall} caseTitle={c.title} />
          </div>
        </section>
      ) : (
        <section className="card p-5 text-center" data-testid="public-cta">
          <h2 className="font-serif text-2xl">Think you can beat {card.overall}?</h2>
          <p className="mt-1 text-sm text-ink-2">Same patient, same rubric. Free, no account needed.</p>
          <Link href={`/practice/${c.id}?challenge=${s.id}`} className="btn-primary mt-4 px-5" data-testid="accept-challenge">Take the challenge</Link>
        </section>
      )}

      {owner && s.status === "noting" && (
        <section className="rounded-xl border border-warn/30 bg-warn-50 p-5" data-testid="write-note-cta">
          <h2 className="font-semibold">Your note isn&apos;t graded yet</h2>
          <p className="mt-1 text-sm text-ink-2">Write your SOAP note to finish the case and see how Chartside would chart it.</p>
          <Link href={`/practice/${c.id}?s=${s.id}`} className="btn-primary mt-3">Write my note</Link>
        </section>
      )}

      {owner && (
        <>
          <section className="card grid gap-6 p-5 sm:grid-cols-2" data-testid="rubric">
            <Items title="History" items={g.encounter.history} owner />
            <div className="space-y-6">
              <Items title="Physical exam" items={g.encounter.exam} owner />
              <Items title="Communication" items={g.encounter.communication} owner />
            </div>
          </section>

          {g.note && (
            <section className="card p-5" data-testid="note-compare">
              <h2 className="font-serif text-2xl">Your note vs how Chartside would chart it</h2>
              <p className="mt-1 text-sm text-ink-2">
                Documentation {g.note.parts.documentation}/40 · Differential {g.note.parts.differential}/30 · Plan {g.note.parts.plan}/30{g.note.parts.penalty ? ` · minus ${g.note.parts.penalty} for charting things you didn't find` : ""}
              </p>
              {g.note.invented.length > 0 && <p className="mt-2 text-sm text-rec" data-testid="invented">In your note but never asked or examined: {g.note.invented.join("; ")}.</p>}
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Your note · {g.note.score}</h3>
                  <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-paper p-3 font-mono text-[13px] leading-relaxed" data-testid="my-note">{s.note}</pre>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Chartside · {s.reference?.score ?? "–"}</h3>
                  <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-brand-50 p-3 font-mono text-[13px] leading-relaxed" data-testid="chartside-note">{s.reference?.text || "Chartside needs a few more questions in the transcript to write a note."}</pre>
                  <p className="mt-1 text-xs text-ink-3">Written from the same transcript by {s.reference?.engine === "claude" ? "Claude" : "the on-device engine"}. Every line comes from something said in the room.</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Differential</h3>
                  <ul className="mt-2 space-y-1">{g.note.differential.map((d) => <li key={d.dx} className="flex items-center gap-2">{d.hit ? <Check size={15} className="text-ok" /> : <X size={15} className="text-rec" />}{d.dx}{d.leading && <span className="pill bg-brand-50 text-brand">Leading</span>}</li>)}</ul>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Plan</h3>
                  <ul className="mt-2 space-y-1">{g.note.plan.map((p) => <li key={p.label} className="flex items-center gap-2">{p.hit ? <Check size={15} className="text-ok" /> : <X size={15} className="text-rec" />}{p.label}</li>)}</ul>
                </div>
              </div>
            </section>
          )}

          <AttendingMode id={s.id} questions={c.pimp.map((p) => p.q)} initial={s.presentation ? { text: s.presentation.text, seconds: s.presentation.seconds, grade: s.presentation.grade, pimp: s.presentation.pimp } : null} />

          {user && !user.guestUntil ? (
            <p className="text-center text-sm text-ink-3" data-testid="saved-as">Saved to your account ({user.email}).</p>
          ) : (
            <SaveProgress next={`/practice/s/${s.id}`} />
          )}

          <section className="card p-5" data-testid="transcript">
            <h2 className="font-semibold">Transcript</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {s.turns.map((t) => (
                <li key={t.id} id={`turn-${t.id}`} className={`scroll-mt-20 rounded-lg px-3 py-1.5 target:bg-evidence ${t.role === "exam" ? "bg-info-50" : ""}`}>
                  <span className="mr-2 font-mono text-xs text-ink-3">{clock(t.t)}</span>
                  <span className="font-semibold">{t.role === "student" ? "You" : t.role === "exam" ? "Exam" : who}:</span> {t.text}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      <section className="rounded-xl border border-line bg-surface p-5 text-center text-sm text-ink-2">
        Residents and students: when you start seeing real patients, Chartside writes the note for you. <Link href="/line" className="font-medium text-brand">See how</Link>
      </section>
    </div>
  );
}
