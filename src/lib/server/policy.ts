import type { Encounter } from "../types";
import { ROLE_INFO } from "../roles";
import type { Role, User } from "./repo";

export { ROLE_INFO };

export type Permission =
  | "clinical.capture"
  | "clinical.edit"
  | "clinical.create"
  | "patients.write"
  | "billing.view"
  | "billing.review"
  | "templates.share"
  | "org.manage"
  | "org.analytics"
  | "nursing.document";

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
  "nursing.document": ["owner", "admin", "clinician", "nurse"],
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
    this.name = "Forbidden";
  }
}

export class Invalid extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Invalid";
  }
}

export function assertCan(u: User, p: Permission, message?: string) {
  if (!can(u, p)) throw new Forbidden(message ?? `Your role (${ROLE_INFO[u.role].label}) can't do that.`);
}
