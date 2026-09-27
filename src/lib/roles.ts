export type Role = "owner" | "admin" | "clinician" | "scribe" | "coder" | "viewer";

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  owner: { label: "Owner", description: "Full control, including billing, members, SSO, and ownership." },
  admin: { label: "Admin", description: "Manages members, invites, SSO, shared templates, and org analytics. Can document their own visits." },
  clinician: { label: "Clinician", description: "Records visits, edits and signs their own notes, and sees their own claims." },
  scribe: { label: "Scribe", description: "Supports clinicians across the org: captures visits and edits drafts. Cannot sign." },
  coder: { label: "Coder / biller", description: "Reviews, edits, approves, and submits claims for the whole org. Read-only on notes." },
  viewer: { label: "Viewer", description: "Read-only access to visits, claims, and analytics (e.g. compliance, QA)." },
};

export const roleLabel = (r: string) => ROLE_INFO[r as Role]?.label ?? r;
