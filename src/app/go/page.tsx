import { captureTz } from "@/lib/server/tz";
import Link from "next/link";
import GoRecorder from "@/components/ghost/GoRecorder";
import LiveCallBanner from "@/components/ghost/LiveCallBanner";
import LineChecklist from "@/components/ghost/LineChecklist";
import { hasPhonePin } from "@/lib/server/magic";
import { currentUser } from "@/lib/server/auth";
import { decisionCounts } from "@/lib/server/decisions";
import { recordingMinutesFromEnv } from "@/lib/engine/limits";

export const dynamic = "force-dynamic";
export const metadata = { title: "Record a visit · Chartside", description: "One tap to record a visit. Chartside writes the note." };

function lineDisplay() {
  const raw = process.env.CHARTSIDE_LINE_NUMBER || "";
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (!raw) return null;
  return { tel: raw, text: process.env.CHARTSIDE_LINE_DISPLAY || (d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw) };
}

export default async function GoPage({ searchParams }: { searchParams: Promise<{ shared?: string; welcome?: string }> }) {
  const { shared, welcome } = await searchParams;
  const found = await currentUser().catch(() => null);
  const user = found ? await captureTz(found).catch(() => found) : null;
  const counts = user ? await decisionCounts(user).catch(() => null) : null;
  const sample = !!user?.prefs.sampleDay;
  const line = lineDisplay();
  const pin = user && !user.guestUntil ? await hasPhonePin(user.id).catch(() => false) : false;
  return (
    <main className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 text-sm">
        <Link href="/line" className="flex items-center gap-2 font-semibold text-ink">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white">C</span>
          Chartside
        </Link>
        <nav className="flex min-w-0 flex-nowrap justify-end gap-0 whitespace-nowrap sm:gap-1">
          <Link href="/go/phone" className="btn-ghost px-2 sm:px-3" aria-label="Call instead"><span className="sm:hidden">Call</span><span className="hidden sm:inline">Call instead</span></Link>
          {user && <Link href="/go/stack" className="btn-ghost px-2 sm:px-3">To review</Link>}
          {user && <Link href="/go/ask" className="btn-ghost px-2 sm:px-3">Ask</Link>}
          {user && !user.guestUntil && <Link href="/today" className="btn-ghost px-2 sm:px-3" data-testid="go-more">More</Link>}
        </nav>
      </header>
      {shared && (
        <p className="mx-auto max-w-md rounded-lg bg-warn-50 px-3 py-2 text-center text-sm text-warn" role="alert" data-testid="go-shared-msg">
          {shared}
        </p>
      )}
      {user && (
        <div className="mx-auto max-w-3xl px-4">
          <LiveCallBanner />
        </div>
      )}
      {user && !user.guestUntil && welcome === "1" && (
        <p className="mx-auto mt-1 max-w-md px-4 text-center text-sm text-ink-2" data-testid="go-welcome">
          You&apos;re in. Tap Start visit when your patient is in the room. No patient handy? <Link href="/go/phone?autopilot=1" className="font-medium text-brand underline">Hear a sample call</Link>.
        </p>
      )}
      {user && !user.guestUntil && line && (
        <p className="mx-4 mt-3 rounded-2xl border border-line bg-surface px-4 py-2 text-center text-sm text-ink-2 sm:mx-auto sm:max-w-md" data-testid="go-line-card">
          <span className="font-medium text-ink">Your line:</span> call{" "}<a className="font-semibold text-brand underline" href={`tel:${line.tel}`}>{line.text}</a>{" "}before your next visit
        </p>
      )}
      {user && !user.guestUntil && (
        <div className="px-4 pt-2">
          <LineChecklist phone={!!user.phone} pin={pin} />
        </div>
      )}
      <GoRecorder signedIn={!!user} guest={!!user?.guestUntil} sample={!!sample} waiting={counts?.total ?? 0} maxMinutes={recordingMinutesFromEnv()} />
    </main>
  );
}
