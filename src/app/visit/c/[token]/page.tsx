import OfferClaim from "@/components/visit/OfferClaim";
import { STATE_NAMES } from "@/lib/engine/lexicon";
import { emailReady } from "@/lib/server/delivery";

export const metadata = { title: "A draft note for you · Chartside", robots: { index: false }, referrer: "no-referrer" as const };

export default async function OfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const states = Object.entries(STATE_NAMES).map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <main className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-md items-center gap-2 px-4 py-4 font-semibold text-ink">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white">C</span>
        Chartside
      </header>
      <div className="mx-auto max-w-md px-4 pb-16">
        <OfferClaim token={token} states={states} emailReady={emailReady()} />
      </div>
    </main>
  );
}
