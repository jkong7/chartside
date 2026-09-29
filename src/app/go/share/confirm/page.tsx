import { cookies } from "next/headers";
import Link from "next/link";
import ShareConfirm from "@/components/ghost/ShareConfirm";
import { peekShared, SHARE_COOKIE } from "@/lib/server/sharedAudio";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared recording · Chartside", robots: { index: false } };

export default async function ShareConfirmPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const info = t ? peekShared(t, (await cookies()).get(SHARE_COOKIE)?.value) : null;
  return (
    <main className="flex min-h-screen items-center bg-paper px-4 py-10">
      {info && t ? (
        <ShareConfirm id={t} name={info.name} size={info.bytes} />
      ) : (
        <div className="card mx-auto max-w-md p-6 text-center" data-testid="share-expired">
          <p className="text-ink">This shared recording expired or was already used.</p>
          <Link href="/go" className="btn-outline mt-4">Record in Chartside</Link>
        </div>
      )}
    </main>
  );
}
