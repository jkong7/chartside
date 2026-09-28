import CheckinForm from "@/components/CheckinForm";
import { publicCheckin } from "@/lib/server/checkin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check-in · Chartside", robots: { index: false } };

export default async function CheckinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await publicCheckin(token);
  return (
    <main className="min-h-screen bg-paper px-4 py-10">
      <div className="mx-auto max-w-lg">{d ? <CheckinForm token={token} data={d} /> : <div className="card p-6 text-sm">This link has expired.</div>}</div>
    </main>
  );
}
