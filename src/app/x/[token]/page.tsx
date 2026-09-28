import { cookies } from "next/headers";
import ExternalShare from "@/components/ExternalShare";
import SharedNote from "@/components/SharedNote";
import { externalInfo, externalView, SHARE_COOKIE } from "@/lib/server/sharing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared visit note · Chartside", robots: { index: false } };

export default async function ExternalSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await externalInfo(token);
  const shell = (children: React.ReactNode) => <main className="min-h-screen bg-paper px-4 py-10"><div className="mx-auto max-w-3xl">{children}</div></main>;
  if (!info) return shell(<div className="card p-6 text-sm" data-testid="xshare-invalid">This link has expired or was turned off. Ask the sender to share the note again.</div>);
  const view = await externalView(token, (await cookies()).get(SHARE_COOKIE)?.value);
  if (view) return shell(<SharedNote s={view} from={view.from} message={view.message} banner={`Shared by ${view.from}${info.org ? `, ${info.org}` : ""} · view only · link expires ${new Date(info.expiresAt!).toLocaleDateString("en-US")}`} />);
  return shell(<ExternalShare token={token} email={info.email} from={info.from} org={info.org} />);
}
