import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CASES } from "@/lib/engine/practice/cases";
import { leaderboard } from "@/lib/server/practice";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const code = decodeURIComponent((await params).code).toUpperCase();
  return { title: `${code} leaderboard · Chartside Practice`, robots: { index: false } };
}

export default async function ClassBoard({ params }: { params: Promise<{ code: string }> }) {
  const board = await leaderboard(decodeURIComponent((await params).code)).catch(() => null);
  if (!board) notFound();
  return (
    <div className="mx-auto max-w-2xl px-4 pt-4 sm:px-0" data-testid="practice-board">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Class leaderboard</p>
      <h1 className="mt-2 font-serif text-4xl">{board.code}</h1>
      <p className="mt-2 text-ink-2">Best score per person per case. First names only.</p>
      {board.rows.length ? (
        <ol className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {board.rows.map((r, i) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3" data-testid="board-row">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${i < 3 ? "bg-brand text-white" : "bg-sunken text-ink-2"}`}>{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{r.name}</span>
                {r.student && <span className="pill ml-2 bg-info-50 text-info">Student</span>}
                <span className="block truncate text-xs text-ink-3">{r.caseTitle}</span>
              </span>
              <Link href={`/practice/s/${r.id}`} className="font-serif text-2xl text-brand" aria-label={`${r.name}'s scorecard, ${r.score}`}>{r.score}</Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-6 rounded-xl border border-dashed border-line-strong bg-surface p-6 text-center text-ink-2" data-testid="board-empty">No scores yet. Be the first.</p>
      )}
      <div className="mt-8">
        <h2 className="font-semibold">Add a score for {board.code}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {CASES.map((c) => (
            <Link key={c.id} href={`/practice/${c.id}?class=${encodeURIComponent(board.code)}`} className="rounded-full border border-line-strong bg-surface px-3 py-1 text-sm hover:border-brand hover:text-brand">{c.title}</Link>
          ))}
        </div>
      </div>
    </div>
  );
}
