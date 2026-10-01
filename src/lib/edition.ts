export type Edition = "core" | "full";

export function edition(): Edition {
  return process.env.CHARTSIDE_EDITION === "full" ? "full" : "core";
}

export const isCore = () => edition() === "core";

const HIDDEN_PAGES = [
  "/care-management",
  "/compliance",
  "/ed",
  "/forms",
  "/groups",
  "/hospital",
  "/impact",
  "/inbox",
  "/insights",
  "/qa",
  "/quality",
  "/queue",
  "/research",
  "/revenue",
  "/risk",
  "/scheduling",
  "/shared",
  "/templates",
  "/practice",
  "/visit",
  "/barn",
  "/intake",
  "/c",
  "/s",
  "/x",
  "/smart",
  "/scim",
];

const HIDDEN_API = [
  "/api/admissions",
  "/api/ccm",
  "/api/checkins",
  "/api/claims",
  "/api/codes",
  "/api/ed",
  "/api/ehr",
  "/api/fax",
  "/api/faxes",
  "/api/forms",
  "/api/groups",
  "/api/inbox",
  "/api/insights",
  "/api/intake",
  "/api/messages",
  "/api/order-sets",
  "/api/practice",
  "/api/qa",
  "/api/quality",
  "/api/queue",
  "/api/revenue",
  "/api/schedule",
  "/api/share",
  "/api/tasks",
  "/api/tcm",
  "/api/templates",
  "/api/trials",
  "/api/v1",
  "/api/visit",
  "/api/whatsapp",
  "/api/c",
  "/api/x",
  "/api/voice/practice",
  "/api/admin/api-keys",
  "/api/admin/billing",
  "/api/admin/fax",
  "/api/admin/growth",
  "/api/admin/hl7",
  "/api/admin/plan",
  "/api/admin/sso",
  "/api/admin/webhooks",
];

const HIDDEN_ENCOUNTER_API = new Set(["calculators", "checkin", "claim", "coding", "documents", "ehr", "forms", "gdmt", "hl7", "ics", "intake", "order-sets", "orders", "prior-auth", "quality", "share", "shares", "tasks", "trials"]);
const HIDDEN_PATIENT_API = new Set(["ehr", "records", "owner-phone"]);

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function hiddenInCore(path: string) {
  if (HIDDEN_PAGES.some((p) => under(path, p)) || HIDDEN_API.some((p) => under(path, p))) return true;
  const enc = /^\/api\/encounters\/[^/]+\/([^/]+)/.exec(path);
  if (enc && HIDDEN_ENCOUNTER_API.has(enc[1])) return true;
  const pat = /^\/api\/patients\/[^/]+\/([^/]+)/.exec(path);
  return !!pat && HIDDEN_PATIENT_API.has(pat[1]);
}

export const CORE_NAV = ["/today", "/go", "/go/stack", "/patients", "/admin", "/settings"];
export const CORE_NAV_LABELS: Record<string, string> = { "/today": "Visits", "/go": "Record", "/go/stack": "To review" };
export const CORE_ADMIN_TABS = ["members", "line", "security", "audit", "org"];
export const CORE_DECISIONS = ["note.sign", "note.cosign", "patient.match", "proposal"] as const;
