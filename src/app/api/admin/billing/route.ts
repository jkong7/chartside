import { codesetStatus, pfs } from "@/lib/codesets";
import { validNpi } from "@/lib/rcm/npi";
import type { BillingSettings } from "@/lib/rcm/reference";
import { authed, body, json } from "@/lib/server/http";
import { assertCan, Invalid } from "@/lib/server/policy";
import { billingSettings } from "@/lib/server/rcm";
import { audit, orgs } from "@/lib/server/repo";

export const GET = authed(async (_req, user) => {
  assertCan(user, "org.manage");
  return json({ settings: await billingSettings(user.orgId), localities: pfs.localities().map((l) => ({ key: `${l.mac}:${l.locality}`, label: `${l.state} · ${l.name}`, mac: l.mac })), codesets: codesetStatus() });
});

export const PUT = authed(async (req, user) => {
  assertCan(user, "org.manage");
  const b = await body<Partial<BillingSettings>>(req);
  const cur = await billingSettings(user.orgId);
  const next: BillingSettings = { ...cur };
  if (b.locality !== undefined) {
    if (!pfs.localities().some((l) => `${l.mac}:${l.locality}` === b.locality)) throw new Invalid("Choose a Medicare locality from the list");
    next.locality = b.locality;
  }
  for (const k of ["chargeMultiplier", "commercialMultiplier", "medicaidMultiplier"] as const) {
    if (b[k] === undefined) continue;
    const v = Number(b[k]);
    if (!Number.isFinite(v) || v < 0.1 || v > 10) throw new Invalid("Multipliers must be between 0.1 and 10");
    next[k] = Math.round(v * 100) / 100;
  }
  if (b.qualifyingApm !== undefined) next.qualifyingApm = !!b.qualifyingApm;
  if (b.npi !== undefined) {
    const npi = String(b.npi).trim();
    if (npi && !validNpi(npi)) throw new Invalid("That NPI fails the check-digit test (Luhn with the 80840 prefix)");
    next.npi = npi || undefined;
    next.demoIdentifiers = false;
  }
  if (b.tin !== undefined) {
    const tin = String(b.tin).trim();
    if (tin && !/^\d{2}-?\d{7}$/.test(tin)) throw new Invalid("Enter the tax ID as 12-3456789");
    next.tin = tin || undefined;
    next.demoIdentifiers = false;
  }
  if (b.taxonomy !== undefined) next.taxonomy = String(b.taxonomy).trim().toUpperCase() || undefined;
  const org = (await orgs.get(user.orgId))!;
  await orgs.update(org.id, { settings: { ...org.settings, billing: next } });
  await audit.log(user, null, "billing.settings_updated", { locality: next.locality, chargeMultiplier: next.chargeMultiplier, qualifyingApm: next.qualifyingApm });
  return json({ settings: next });
});
