import { all, get } from "../db";
import { Forbidden, Invalid } from "./policy";
import { audit, orgs, type User } from "./repo";

export type Tier = "trial" | "pro" | "enterprise";

export interface Plan {
  tier: Tier;
  seats: number | null;
  startedAt: string;
  trialEndsAt: string | null;
}

export const PRICE_PER_SEAT = 99;
const TRIAL_DAYS = 14;
const TRIAL_SEATS = 3;
const CLINICAL = new Set(["owner", "admin", "clinician"]);

export async function planFor(orgId: string): Promise<Plan & { used: number; pending: number; daysLeft: number | null; monthly: number | null }> {
  const org = (await orgs.get(orgId))!;
  const stored = (org.settings as { plan?: Plan }).plan;
  const plan: Plan = stored ?? { tier: "trial", seats: TRIAL_SEATS, startedAt: org.createdAt, trialEndsAt: new Date(new Date(org.createdAt).getTime() + TRIAL_DAYS * 86400000).toISOString() };
  const used = (await orgs.members(orgId)).filter((m) => m.status === "active" && CLINICAL.has(m.role)).length;
  const pending = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM invites WHERE org_id = ? AND role IN ('owner', 'admin', 'clinician') AND accepted_at IS NULL AND expires_at > ?", orgId, new Date().toISOString()))?.n ?? 0);
  const daysLeft = plan.trialEndsAt ? Math.max(0, Math.ceil((new Date(plan.trialEndsAt).getTime() - Date.now()) / 86400000)) : null;
  return { ...plan, used, pending, daysLeft, monthly: plan.tier === "pro" && plan.seats ? plan.seats * PRICE_PER_SEAT : null };
}

export async function assertSeat(orgId: string, role: string) {
  if (!CLINICAL.has(role)) return;
  const p = await planFor(orgId);
  if (p.seats !== null && p.used + p.pending >= p.seats) throw new Invalid(`All ${p.seats} clinician seats are in use${p.pending ? ` (including ${p.pending} pending invite${p.pending === 1 ? "" : "s"})` : ""}. Add seats in Admin, Plan & usage, or invite this person as a scribe, nurse, coder, or viewer.`);
}

export async function changePlan(u: User, input: { tier?: Tier; seats?: number }) {
  if (u.role !== "owner") throw new Forbidden("Only an owner can change the plan");
  const org = (await orgs.get(u.orgId))!;
  const cur = await planFor(u.orgId);
  const tier = input.tier ?? cur.tier;
  if (tier === "trial") throw new Invalid("You can't return to a trial");
  const seats = tier === "enterprise" ? null : Math.round(Number(input.seats ?? cur.seats ?? 1));
  if (seats !== null && (!Number.isFinite(seats) || seats < 1 || seats > 500)) throw new Invalid("Seats must be between 1 and 500");
  if (seats !== null && seats < cur.used) throw new Invalid(`${cur.used} clinicians are active. Remove members before going below ${cur.used} seats.`);
  const next: Plan = { tier, seats, startedAt: cur.tier === tier ? cur.startedAt : new Date().toISOString(), trialEndsAt: null };
  await orgs.update(org.id, { settings: { ...org.settings, plan: next } as typeof org.settings });
  await audit.log(u, null, "plan.changed", { from: cur.tier, to: tier, seats });
  return planFor(u.orgId);
}

export async function usage(orgId: string, month = new Date().toISOString().slice(0, 7)) {
  const from = `${month}-01T00:00:00.000Z`;
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const to = d.toISOString();
  const count = async (action: string) => Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM audit WHERE org_id = ? AND action = ? AND created_at >= ? AND created_at < ?", orgId, action, from, to))?.n ?? 0);
  const minutes = Number((await get<{ s: number | null }>("SELECT SUM(e.duration_s) AS s FROM encounters e WHERE e.org_id = ? AND e.started_at >= ? AND e.started_at < ? AND EXISTS (SELECT 1 FROM utterances ut WHERE ut.encounter_id = e.id AND ut.source <> 'typed')", orgId, from, to))?.s ?? 0) / 60;
  const byClinician = await all<{ name: string; n: number }>("SELECT us.name, COUNT(*) AS n FROM audit a JOIN users us ON us.id = a.user_id WHERE a.org_id = ? AND a.action = 'note.signed' AND a.created_at >= ? AND a.created_at < ? GROUP BY us.name ORDER BY n DESC", orgId, from, to);
  return { month, drafted: await count("note.generated"), signed: await count("note.signed"), audioMinutes: Math.round(minutes), activeClinicians: byClinician.length, byClinician: byClinician.map((r) => ({ name: r.name, signed: Number(r.n) })) };
}
