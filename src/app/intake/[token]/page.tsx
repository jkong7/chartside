import IntakeForm from "@/components/IntakeForm";

export const metadata = { title: "Before your visit · Chartside", robots: { index: false } };

export default async function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  return <IntakeForm token={(await params).token} />;
}
