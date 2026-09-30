import type { Metadata } from "next";
import Link from "next/link";
import { claimHours } from "@/lib/server/practice";

export const metadata: Metadata = { title: "Practice link · Chartside Practice", robots: { index: false }, referrer: "no-referrer" };

const copy = (hours: number) => ({
  used: { title: "This link was already opened on another device", body: "For privacy, a scorecard link from the phone line works once, on the first phone or computer that opens it. Open it there to write your note and see your score." },
  expired: { title: "This link has expired", body: `Scorecard links from the phone line work for ${hours} hours. Call the line again to practice another case.` },
  invalid: { title: "This link doesn't work", body: "Check that you opened the whole link from your text. You can also start a new case right here." },
});

export default async function PracticeLinkPage({ searchParams }: { searchParams: Promise<{ why?: string }> }) {
  const why = (await searchParams).why;
  const all = copy(claimHours());
  const c = why === "used" || why === "expired" ? all[why] : all.invalid;
  return (
    <div className="mx-auto max-w-md px-4 pt-6 sm:px-0" data-testid="practice-link" data-why={why === "used" || why === "expired" ? why : "invalid"}>
      <section className="card p-6 text-center">
        <h1 className="font-serif text-2xl leading-tight">{c.title}</h1>
        <p className="mt-3 text-sm text-ink-2">{c.body}</p>
        <Link href="/practice" className="btn-primary mt-5 px-5">Practice a case</Link>
      </section>
    </div>
  );
}
