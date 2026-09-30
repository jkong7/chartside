import { profileFor, profileFromTaxonomy } from "../engine/specialty";
import { isVetSpecialty, vetDefaultTemplate } from "../engine/templates";
import { validTz } from "../tz";
import { claimNpi, lookupNpi, npiValid } from "./growth";
import { actorFor, audit, orgs, users, type User } from "./repo";

export interface SignupProfile {
  name?: string;
  specialty?: string;
  npi?: string;
  demo?: boolean;
  tz?: string;
}

export function cleanProfile(p: SignupProfile | null | undefined): SignupProfile {
  const npi = String(p?.npi ?? "").replace(/\D/g, "");
  return {
    name: String(p?.name ?? "").trim().slice(0, 120) || undefined,
    specialty: String(p?.specialty ?? "").trim().slice(0, 80) || undefined,
    npi: npiValid(npi) ? npi : undefined,
    demo: !!p?.demo,
    tz: validTz(p?.tz) ? p!.tz : undefined,
  };
}

export async function npiPreview(npi: string) {
  const rec = await lookupNpi(npi);
  if (!rec) return null;
  const profile = profileFromTaxonomy(rec.specialty, rec.taxonomyCode);
  return { ...rec, name: `${rec.first} ${rec.last}`.trim(), profile };
}

export async function setupNewAccount(userId: string, input: SignupProfile | null | undefined, opts: { seed?: boolean } = {}): Promise<User | undefined> {
  const p = cleanProfile(input);
  const base = await users.byId(userId);
  if (!base) return undefined;
  const vet = isVetSpecialty(p.specialty ?? base.specialty);
  const chosen = vet ? { specialty: p.specialty ?? base.specialty, templateId: vetDefaultTemplate(p.specialty ?? base.specialty), noteDetail: "standard" as const } : profileFor(p.specialty ?? base.specialty);
  await users.update(userId, { name: p.name, specialty: p.specialty ? chosen.specialty : undefined, prefs: { simpleNav: true, ...(p.tz ? { tz: p.tz } : {}), ...(p.specialty || vet ? { defaultTemplate: chosen.templateId, noteDetail: chosen.noteDetail } : {}) } });
  let actor = await actorFor(userId);
  if (!actor) return undefined;
  if (vet && actor.role === "owner" && actor.orgId) {
    const org = await orgs.get(actor.orgId);
    if (org && org.settings.jurisdiction !== "veterinary") {
      await orgs.update(actor.orgId, { settings: { ...org.settings, jurisdiction: "veterinary" } });
      await audit.log(actor, null, "org.jurisdiction", { from: org.settings.jurisdiction ?? "us_hipaa", to: "veterinary", via: "signup" });
    }
  }
  if (p.name && actor.role === "owner") {
    for (const m of await orgs.memberships(userId)) if (m.role === "owner" && /(?:'s practice|'s clinic|^Unsaved practice)$/.test(m.name)) await orgs.update(m.org_id, { name: `${p.name}'s practice` });
    actor = (await actorFor(userId, actor.orgId)) ?? actor;
  }
  if (p.npi && !vet) {
    try {
      const claim = await claimNpi(actor, { npi: p.npi });
      if (claim.matched) {
        const fromNpi = profileFromTaxonomy(claim.specialty);
        await users.update(userId, { specialty: fromNpi.specialty === "Other" ? claim.specialty || undefined : fromNpi.specialty, prefs: { defaultTemplate: fromNpi.templateId, noteDetail: fromNpi.noteDetail } });
      }
    } catch (err) {
      await audit.log(actor, null, "signup.npi_failed", { error: err instanceof Error ? err.message.slice(0, 120) : "error" });
    }
    actor = (await actorFor(userId, actor.orgId)) ?? actor;
  }
  if (p.demo && !vet && opts.seed !== false) {
    const { seedDemo } = await import("./seed");
    await seedDemo(actor);
    actor = (await actorFor(userId, actor.orgId)) ?? actor;
  }
  await audit.log(actor, null, "signup.profile", { npi: !!p.npi, demo: !!p.demo, specialty: (await users.byId(userId))?.specialty ?? null });
  return actor;
}
