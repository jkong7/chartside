import { isCore } from "../edition";
import { get } from "../db";
import { hl7Config } from "./hl7";
import type { User } from "./repo";

export interface OnboardingItem {
  key: string;
  label: string;
  detail: string;
  href: string;
  done: boolean;
}

const one = async (sql: string, ...p: string[]) => !!(await get<{ x: number }>(`SELECT 1 AS x ${sql} LIMIT 1`, ...p));

export async function onboarding(u: User): Promise<OnboardingItem[] | null> {
  if (!["owner", "admin", "clinician"].includes(u.role) || u.prefs.onboardingDismissed) return null;
  const items: OnboardingItem[] = [
    { key: "record", label: "Record a visit", detail: "Pick a patient on Today, get consent, and start listening. The draft is ready about a minute after you finish.", href: "/today", done: await one("FROM audit WHERE user_id = ? AND action IN ('capture.started', 'capture.manual')", u.id) },
    { key: "personalize", label: "Make the note yours", detail: "Save a template, a snippet, or a style rule so drafts read the way you write.", href: "/templates", done: (await one("FROM templates WHERE user_id = ?", u.id)) || (await one("FROM snippets WHERE user_id = ?", u.id)) || (await one("FROM audit WHERE user_id = ? AND action IN ('style.rule_added', 'style.matched')", u.id)) },
    { key: "ehr", label: "Connect your EHR", detail: "Launch from Epic with SMART on FHIR, send signed notes over HL7, or use the Chrome extension with any web EHR.", href: "/settings", done: (await one("FROM ehr_connections WHERE user_id = ?", u.id)) || !!(await hl7Config(u.orgId))?.enabled || (await one("FROM audit WHERE user_id = ? AND action LIKE 'ehr.%'", u.id)) },
    { key: "mfa", label: "Turn on two-step verification", detail: "Protect patient data with an authenticator app.", href: "/settings", done: await one("FROM users WHERE id = ? AND mfa_enabled_at IS NOT NULL", u.id) },
  ];
  if (["owner", "admin"].includes(u.role)) items.push({ key: "team", label: "Invite your team", detail: "Add clinicians, scribes, nurses, and billers. Roles control what each person can see and sign.", href: "/admin", done: (await one("FROM memberships WHERE org_id = ? AND user_id <> ?", u.orgId, u.id)) || (await one("FROM invites WHERE org_id = ?", u.orgId)) });
  if (isCore()) return items.filter((i) => i.key !== "ehr").map((i) => (i.key === "personalize" ? { ...i, detail: "Paste an old note or add a style rule so drafts read the way you write.", href: "/settings" } : i));
  return items;
}
