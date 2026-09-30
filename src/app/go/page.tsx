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

export default async function GoPage({ searchParams }: { searchParams: Promise<{ shared?: string }> }) {
  const { shared } = await searchParams;
  const found = await currentUser().catch(() => null);
  const user = found ? await captureTz(found).catch(() => found) : null;
  const counts = user ? await decisionCounts(user).catch(() => null) : null;
  const sample = !!user?.prefs.sampleDay;
  const pin = user && !user.guestUntil ? await hasPhonePin(user.id).catch(() => false) : false;
  return (
    <main className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 text-sm">
        <Link href="/line" className="flex items-center gap-2 font-semibold text-ink">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white">C</span>
          Chartside
        </Link>
        <nav className="flex gap-1">
          <Link href="/go/phone" className="btn-ghost">Call instead</Link>
          {user && <Link href="/go/stack" className="btn-ghost">To review</Link>}
          {user && <Link href="/go/ask" className="btn-ghost">Ask</Link>}
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
      {user && !user.guestUntil && (
        <div className="px-4 pt-2">
          <LineChecklist phone={!!user.phone} pin={pin} />
        </div>
      )}
      <GoRecorder signedIn={!!user} guest={!!user?.guestUntil} sample={!!sample} waiting={counts?.total ?? 0} maxMinutes={recordingMinutesFromEnv()} />
    </main>
  );
}
