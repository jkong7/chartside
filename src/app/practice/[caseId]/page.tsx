import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PracticeRoom, { type Resume } from "@/components/practice/PracticeRoom";
import { doorCard, practiceCase } from "@/lib/engine/practice/cases";
import { currentUser } from "@/lib/server/auth";
import { cleanName, elapsed, getPractice, owns } from "@/lib/server/practice";
import { practiceActor } from "@/lib/server/practiceHttp";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ caseId: string }> }): Promise<Metadata> {
  const c = practiceCase((await params).caseId);
  if (!c) return { title: "Chartside Practice" };
  const title = `${c.title}: practice case · Chartside Practice`;
  return { title, description: c.blurb, openGraph: { title: `Practice case: ${c.title}`, description: `${c.blurb} Talk to the patient, write the note, get graded.` } };
}

export default async function PracticeCasePage({ params, searchParams }: { params: Promise<{ caseId: string }>; searchParams: Promise<{ s?: string; challenge?: string; class?: string }> }) {
  const c = practiceCase((await params).caseId);
  if (!c) notFound();
  const sp = await searchParams;
  const actor = await practiceActor();
  let resume: Resume | null = null;
  if (sp.s) {
    const s = await getPractice(sp.s);
    if (s && s.caseId === c.id && owns(s, actor) && s.status !== "graded") resume = { id: s.id, status: s.status, turns: s.turns, timeLimitS: s.timeLimitS, elapsed: elapsed(s), note: s.note };
  }
  const ch = sp.challenge ? await getPractice(sp.challenge) : null;
  const challenge = ch && ch.caseId === c.id && ch.score !== null ? { id: ch.id, name: ch.name || null, score: ch.score } : null;
  const user = await currentUser().catch(() => null);
  const defaultName = user && !user.guestUntil ? cleanName(user.name) : "";
  return (
    <div className="px-4 pt-2 sm:px-0 sm:pt-4">
      <PracticeRoom card={doorCard(c)} challenge={challenge} resume={resume} classCode={(sp.class ?? "").toUpperCase().slice(0, 24)} defaultName={defaultName} />
    </div>
  );
}
