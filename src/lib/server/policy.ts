import type { Encounter } from "../types";
import type { Role, User } from "./repo";

export type Permission =
  | "clinical.capture"
  | "clinical.edit"
  | "clinical.create"
  | "patients.write"
  | "billing.view"
  | "billing.review"
  | "templates.share"
  | "org.manage"
  | "org.analytics";

const MATRIX: Record<Permission, Role[]> = {
  "clinical.capture": ["owner", "admin", "clinician", "scribe"],
  "clinical.edit": ["owner", "admin", "clinician", "scribe"],
  "clinical.create": ["owner", "admin", "clinician"],
  "patients.write": ["owner", "admin", "clinician", "scribe"],
  "billing.view": ["owner", "admin", "clinician", "coder", "viewer"],
  "billing.review": ["owner", "admin", "coder"],
  "templates.share": ["owner", "admin"],
  "org.manage": ["owner", "admin"],
  "org.analytics": ["owner", "admin", "viewer"],
};

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  owner: { label: "Owner", description: "Full control, including billing, members, SSO, and ownership." },
  admin: { label: "Admin", description: "Manages members, invites, SSO, shared templates, and org analytics. Can document their own visits." },
  clinician: { label: "Clinician", description: "Records visits, edits and signs their own notes, and sees their own claims." },
  scribe: { label: "Scribe", description: "Supports clinicians across the org: captures visits and edits drafts. Cannot sign." },
  coder: { label: "Coder / biller", description: "Reviews, edits, approves, and submits claims for the whole org. Read-only on notes." },
  viewer: { label: "Viewer", description: "Read-only access to visits, claims, and analytics (e.g. compliance, QA)." },
};

export function can(u: User, p: Permission) {
  return MATRIX[p].includes(u.role);
}

export function canSign(u: User, enc: Pick<Encounter, "userId">) {
  return ["owner", "admin", "clinician"].includes(u.role) && enc.userId === u.id;
}

export class Forbidden extends Error {
  constructor(message = "You don't have permission to do that") {
    super(message);
  }
}

export function assertCan(u: User, p: Permission, message?: string) {
  if (!can(u, p)) throw new Forbidden(message ?? `Your role (${ROLE_INFO[u.role].label}) can't do that.`);
}
