import Workspace from "@/components/workspace/Workspace";

export default async function EncounterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  return <Workspace id={id} initialTab={tab} />;
}
