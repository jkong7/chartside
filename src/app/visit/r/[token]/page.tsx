import PatientVisit from "@/components/visit/PatientVisit";

export const metadata = { title: "Your visit · Chartside", robots: { index: false }, referrer: "no-referrer" as const };

export default async function PatientVisitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PatientVisit token={token} />;
}
