import ShareView from "@/components/ShareView";

export const metadata = { title: "Your visit summary · Chartside", robots: { index: false } };

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ShareView token={token} />;
}
