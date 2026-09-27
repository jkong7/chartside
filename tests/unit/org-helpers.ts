import type { Role } from "@/lib/server/repo";

export async function newMember(name: string, opts: { role?: Role; orgId?: string; email?: string } = {}) {
  const repo = await import("@/lib/server/repo");
  const base = await repo.users.create({ email: opts.email ?? `${name.replace(/\W+/g, "").toLowerCase()}${Date.now()}${Math.random().toString(36).slice(2, 6)}@x.test`, name, passwordHash: "x", specialty: "FM" });
  let orgId = opts.orgId;
  if (orgId) await repo.orgs.addMember(orgId, base.id, opts.role ?? "clinician");
  else orgId = (await repo.orgs.create(`${name} clinic`, base.id)).id;
  return (await repo.actorFor(base.id, orgId))!;
}
