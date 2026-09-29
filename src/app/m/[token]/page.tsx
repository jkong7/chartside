import MagicContinue from "@/components/MagicContinue";
import { linkInfo } from "@/lib/server/magic";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · Chartside", robots: { index: false }, referrer: "no-referrer" as const };

export default async function MagicLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await linkInfo(token);
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      {info?.valid ? <MagicContinue token={token} email={info.email} note={/[?&]ready=1\b/.test(info.next)} next={info.next} /> : <div className="card max-w-sm p-6 text-center" data-testid="magic-invalid"><p className="font-medium">This link has expired or was already used</p><p className="mt-2 text-sm text-ink-2">Ask for a new sign-in link.</p><a className="btn-primary mt-4 inline-flex" href="/login">Sign in</a></div>}
    </main>
  );
}
