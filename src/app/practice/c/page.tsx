import { redirect } from "next/navigation";

export default async function ClassLookup({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const code = String((await searchParams).code ?? "").trim().toUpperCase().replace(/\s+/g, "-").replace(/[^A-Z0-9-]/g, "").slice(0, 24);
  redirect(code.length >= 3 ? `/practice/c/${code}` : "/practice");
}
