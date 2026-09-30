import type { Role } from "./roles";

export const SIMPLE_NAV_UNTIL_SIGNED = 3;
export const SURVEY_AFTER_SIGNED = 5;
export const SIMPLE_NAV_HREFS = ["/go", "/go/stack", "/patients", "/settings"];
export const SIMPLE_NAV_LABELS: Record<string, string> = { "/go": "Record", "/go/stack": "To review", "/patients": "Patients", "/settings": "Settings" };

export type NavMode = "simple" | "full";

export interface NavInput {
  role: Role;
  simpleNav?: boolean;
  signedByMe: number;
  teamSize: number;
}

export function navMode(i: NavInput): NavMode {
  if (i.simpleNav !== true) return "full";
  if (i.role === "admin") return "full";
  if (i.role === "owner" && i.teamSize > 1) return "full";
  if (!["owner", "clinician"].includes(i.role)) return "full";
  if (i.signedByMe >= SIMPLE_NAV_UNTIL_SIGNED) return "full";
  return "simple";
}

export function ownSigned(total: number, demoSigned?: number) {
  return Math.max(0, total - Math.max(0, Number(demoSigned ?? 0) || 0));
}
