import { clockTime } from "@/lib/tz";
import { viewerTz } from "@/lib/server/tz";
import PinConfirm from "@/components/ghost/PinConfirm";
import { readPinOffer } from "@/lib/server/telephony/pinByPhone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Turn on your phone PIN · Chartside", robots: { index: false }, referrer: "no-referrer" };

export default async function PinPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const offer = readPinOffer(t);
  const valid = !!offer;
  const when = offer?.at ? clockTime(offer.at, await viewerTz()) : null;
  return (
    <main className="flex min-h-screen items-center bg-paper px-4 py-10">
      {valid && t ? (
        <PinConfirm token={t} when={when} />
      ) : (
        <div className="card mx-auto max-w-md p-6 text-center" data-testid="pin-expired">
          <p className="text-ink">This link expired. Press 6 on your next call to set a PIN again.</p>
        </div>
      )}
    </main>
  );
}
