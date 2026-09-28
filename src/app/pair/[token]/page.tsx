import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/server/auth";
import { redeemPairing } from "@/lib/server/pairing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Record on this phone · Chartside", robots: { index: false } };

export default async function PairPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/pair/${token}`)}`);
  let encId: string | null = null;
  let error: string | null = null;
  try {
    encId = await redeemPairing(user, token, (await headers()).get("user-agent") ?? "");
  } catch (e) {
    error = e instanceof Error ? e.message : "This code didn't work.";
  }
  if (encId) redirect(`/encounters/${encId}?device=phone`);
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="card max-w-sm p-6 text-center" data-testid="pair-error"><p className="font-medium">Couldn&apos;t connect this phone</p><p className="mt-2 text-sm text-ink-2">{error}</p></div>
    </main>
  );
}
