import { get, now, run } from "../db";
import { Forbidden, Invalid } from "./policy";
import { audit, orgs, type Jurisdiction, type User } from "./repo";

export const JURISDICTIONS: Jurisdiction[] = ["us_hipaa", "veterinary", "non_us"];

export async function orgJurisdiction(orgId: string | null | undefined): Promise<Jurisdiction> {
  if (!orgId) return "us_hipaa";
  const o = await orgs.get(orgId);
  return o?.settings.jurisdiction ?? "us_hipaa";
}

export function hipaaApplies(j: Jurisdiction) {
  return j === "us_hipaa";
}

export function whatsappAllowed(j: Jurisdiction | null | undefined, verifiedClinician: boolean) {
  return verifiedClinician && !!j && !hipaaApplies(j);
}

export async function setJurisdiction(u: User, value: string) {
  if (u.role !== "owner") throw new Forbidden("Only the practice owner can change who the practice treats");
  if (!JURISDICTIONS.includes(value as Jurisdiction)) throw new Invalid("Choose US human care, veterinary, or outside the US");
  const org = await orgs.get(u.orgId);
  if (!org) throw new Invalid("Practice not found");
  const from = org.settings.jurisdiction ?? "us_hipaa";
  await orgs.update(u.orgId, { settings: { ...org.settings, jurisdiction: value as Jurisdiction } });
  await audit.log(u, null, "org.jurisdiction", { from, to: value });
  return value as Jurisdiction;
}

export async function textOptedOut(phone: string) {
  return !!(await get<{ phone: string }>("SELECT phone FROM text_optouts WHERE phone = ?", phone));
}

export async function setTextOptOut(phone: string, out: boolean) {
  if (out) {
    if (!(await textOptedOut(phone))) await run("INSERT INTO text_optouts (phone, created_at) VALUES (?, ?)", phone, now());
  } else await run("DELETE FROM text_optouts WHERE phone = ?", phone);
}
