import { createHash } from "node:crypto";
import { all, jsonText } from "../db";
import { addendumTitle, attestationsFor, needsCosign, PRIMARY_CARE_EXCEPTION_CODES, type AddendumKind, type AttestationKey } from "../engine/attest";
import { claimStatus } from "../engine/billing";
import type { Encounter, Note } from "../types";
import { Forbidden, Invalid } from "./policy";
import { addenda, artifacts, audit, claims, encounters, notes, orgs, users, type Addendum, type User } from "./repo";

export interface Signature {
  digest: string;
  at: string;
  by: string;
  byName: string;
  credential: string;
}

export interface Cosign {
  status: "pending" | "cosigned" | "returned";
  authorId: string;
  authorName: string;
  authorCredential: string;
  supervisorId: string;
  supervisorName: string;
  requestedAt: string;
  attestation?: { key: AttestationKey; label: string; modifier: string | null; text: string; source: string };
  cosignedAt?: string;
  returnedAt?: string;
  comment?: string;
  history: { at: string; action: "requested" | "cosigned" | "returned"; by: string; comment?: string }[];
}

export function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

export function bodyText(note: Note) {
  const lines: string[] = [];
  for (const sec of note.sections) {
    const xs = sec.sentences.filter((s) => !s.pending);
    if (!xs.length) continue;
    lines.push(sec.title.toUpperCase());
    if (sec.format === "paragraph") lines.push(xs.map((s) => s.text).join(" "));
    else for (const s of xs) lines.push(`${s.indent ? "   - " : s.heading ? "" : "- "}${s.text}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

function chainDigest(prev: string, a: { kind: string; text: string; reason: string; userId: string; at: string }) {
  return sha256(JSON.stringify([prev, a.kind, a.text, a.reason, a.userId, a.at]));
}

export async function cosignPlan(author: User) {
  const credential = author.credential ?? "";
  const org = await orgs.get(author.orgId);
  if (!needsCosign(credential, { appsRequireCosign: org?.settings.appsRequireCosign })) return { required: false as const };
  const supervisor = author.supervisorId ? await orgs.membership(author.orgId, author.supervisorId) : undefined;
  if (!author.supervisorId || !supervisor || supervisor.status !== "active") return { required: true as const, supervisor: null };
  const s = await users.byId(author.supervisorId);
  return { required: true as const, supervisor: s ? { id: s.id, name: s.name } : null };
}

export async function recordSignature(user: User, enc: Encounter, note: Note, at: string) {
  const sig: Signature = { digest: sha256(bodyText(note)), at, by: user.id, byName: user.name, credential: user.credential ?? "" };
  await artifacts.set(enc.id, "signature", sig);
  const plan = await cosignPlan(user);
  if (plan.required && plan.supervisor) {
    const prev = await artifacts.get<Cosign>(enc.id, "cosign");
    const cosign: Cosign = {
      status: "pending",
      authorId: user.id,
      authorName: user.name,
      authorCredential: user.credential ?? "",
      supervisorId: plan.supervisor.id,
      supervisorName: plan.supervisor.name,
      requestedAt: at,
      history: [...(prev?.history ?? []), { at, action: "requested", by: user.name }],
    };
    await artifacts.set(enc.id, "cosign", cosign);
    await audit.log(user, enc.id, "cosign.requested", { supervisorId: plan.supervisor.id });
    return cosign;
  }
  return null;
}

export async function holdClaimForCosign(user: User, encId: string, cosign: Cosign | null) {
  if (!cosign || cosign.status !== "pending") return;
  const rec = await claims.get(encId);
  if (!rec) return;
  await claims.save(cosign.authorId, encId, "on_hold", rec.content, [...rec.history, { at: new Date().toISOString(), action: "on_hold", note: `Awaiting co-signature from ${cosign.supervisorName}` }]);
}

async function supervisorFor(enc: Encounter & { orgId: string | null }, cosign: Cosign) {
  const author = await orgs.membership(enc.orgId ?? "", enc.userId);
  return new Set([cosign.supervisorId, author?.supervisor_id].filter(Boolean) as string[]);
}

async function signedEncounter(user: User, encId: string) {
  const enc = await encounters.get(user, encId);
  if (!enc) throw new Error("Encounter not found");
  return enc;
}

async function prevDigest(encId: string) {
  const list = await addenda.list(encId);
  if (list.length) return list.at(-1)!.digest;
  const sig = await artifacts.get<Signature>(encId, "signature");
  if (sig) return sig.digest;
  const rec = await notes.latest(encId);
  return sha256(bodyText(rec?.content ?? ({ sections: [] } as unknown as Note)));
}

async function appendAddendum(user: User, encId: string, kind: AddendumKind, text: string, reason: string) {
  const at = new Date().toISOString();
  const prev = await prevDigest(encId);
  const digest = chainDigest(prev, { kind, text, reason, userId: user.id, at });
  const a = await addenda.add({ encounterId: encId, userId: user.id, kind, text, reason, prevDigest: prev, digest, createdAt: at });
  const filing = await artifacts.get<{ status: string; reference?: string }>(encId, "ehr_filing");
  if (filing?.status === "filed") {
    const { fileAddendum } = await import("./ehr");
    const f = await fileAddendum(user, encId, a, filing.reference).catch((err) => ({ status: "error" as const, at: new Date().toISOString(), message: err instanceof Error ? err.message : "Filing failed" }));
    await addenda.setFiling(a.id, f);
    a.filing = f;
  }
  return a;
}

export async function addAddendum(user: User, encId: string, input: { kind?: string; text?: string; reason?: string }) {
  const enc = await signedEncounter(user, encId);
  if (enc.status !== "signed") throw new Invalid("Addenda are added after the note is signed. Edit the draft directly instead.");
  const cosign = await artifacts.get<Cosign>(enc.id, "cosign");
  const allowed = enc.userId === user.id || (cosign && (await supervisorFor(enc, cosign)).has(user.id));
  if (!allowed) throw new Forbidden("Only the signing clinician or their supervising physician can add an addendum.");
  const kind = (["addendum", "late_entry", "correction"].includes(input.kind ?? "") ? input.kind : "addendum") as AddendumKind;
  const text = (input.text ?? "").trim();
  const reason = (input.reason ?? "").trim();
  if (text.length < 3) throw new Invalid("Write the addendum text");
  if (text.length > 5000) throw new Invalid("Addenda are limited to 5,000 characters");
  if (kind === "correction" && !reason) throw new Invalid("A correction needs a reason. The original note stays unchanged.");
  if (kind === "late_entry" && !reason) throw new Invalid("A late entry needs a reason for the delay");
  const a = await appendAddendum(user, enc.id, kind, text, reason);
  await audit.log(user, enc.id, "note.addendum", { kind, id: a.id, chars: text.length });
  return a;
}

export async function cosignNote(user: User, encId: string, input: { attestation?: string; comment?: string }) {
  const enc = await signedEncounter(user, encId);
  const cosign = await artifacts.get<Cosign>(enc.id, "cosign");
  if (!cosign || cosign.status !== "pending") throw new Invalid("This note is not waiting for a co-signature");
  if (!(await supervisorFor(enc, cosign)).has(user.id)) throw new Forbidden(`Only ${cosign.supervisorName} can co-sign this note.`);
  const options = attestationsFor(cosign.authorCredential);
  const att = options.find((a) => a.key === input.attestation) ?? options[0];
  const claim = await claims.get(enc.id);
  const em = claim?.content.lines.find((l) => l.source === "em");
  if (att.modifier === "GE" && em && !PRIMARY_CARE_EXCEPTION_CODES.has(em.cpt)) throw new Invalid(`The primary care exception does not cover ${em.cpt}. Use a teaching physician attestation for this level of service.`);
  const at = new Date().toISOString();
  const text = att.text({ supervisor: user.name, author: cosign.authorName }) + (input.comment?.trim() ? ` ${input.comment.trim()}` : "");
  await appendAddendum(user, enc.id, "attestation", text, att.label);
  const next: Cosign = { ...cosign, status: "cosigned", cosignedAt: at, attestation: { key: att.key, label: att.label, modifier: att.modifier, text, source: att.source }, comment: input.comment?.trim() || undefined, history: [...cosign.history, { at, action: "cosigned", by: user.name, comment: input.comment?.trim() || undefined }] };
  await artifacts.set(enc.id, "cosign", next);
  if (claim) {
    const lines = claim.content.lines.map((l) => (l.source === "em" && att.modifier && !l.modifiers.includes(att.modifier) ? { ...l, modifiers: [...l.modifiers, att.modifier].slice(0, 4) } : l));
    const content = { ...claim.content, lines, supervising: { name: user.name, modifier: att.modifier } };
    await claims.save(enc.userId, enc.id, claimStatus(content), content, [...claim.history, { at, action: "cosigned", note: `${att.label}${att.modifier ? ` (modifier ${att.modifier})` : ""} by ${user.name}`, by: user.name }]);
  }
  await audit.log(user, enc.id, "note.cosigned", { attestation: att.key, modifier: att.modifier });
  return next;
}

export async function returnNote(user: User, encId: string, comment: string) {
  const enc = await signedEncounter(user, encId);
  const cosign = await artifacts.get<Cosign>(enc.id, "cosign");
  if (!cosign || cosign.status !== "pending") throw new Invalid("This note is not waiting for a co-signature");
  if (!(await supervisorFor(enc, cosign)).has(user.id)) throw new Forbidden(`Only ${cosign.supervisorName} can return this note.`);
  const c = comment.trim();
  if (!c) throw new Invalid("Tell the author what to change");
  const at = new Date().toISOString();
  const next: Cosign = { ...cosign, status: "returned", returnedAt: at, comment: c, history: [...cosign.history, { at, action: "returned", by: user.name, comment: c }] };
  await artifacts.set(enc.id, "cosign", next);
  await notes.setStatus(enc.id, "draft");
  await encounters.update(user, enc.id, { status: "review", signedAt: null });
  const claim = await claims.get(enc.id);
  if (claim) await claims.save(enc.userId, enc.id, "on_hold", claim.content, [...claim.history, { at, action: "on_hold", note: `Returned to ${cosign.authorName}: ${c}`, by: user.name }]);
  await audit.log(user, enc.id, "note.returned", { comment: c.slice(0, 200) });
  return next;
}

export async function verifyChain(encId: string) {
  const sig = await artifacts.get<Signature>(encId, "signature");
  const rec = await notes.latest(encId);
  const list = await addenda.list(encId);
  if (!sig || !rec || rec.status !== "signed") return { intact: null as boolean | null, checked: 0, brokenAt: null as string | null };
  if (sha256(bodyText(rec.content)) !== sig.digest) return { intact: false, checked: 0, brokenAt: "note" };
  let prev = sig.digest;
  for (const a of list) {
    if (a.prevDigest !== prev || chainDigest(prev, { kind: a.kind, text: a.text, reason: a.reason, userId: a.userId, at: a.createdAt }) !== a.digest) return { intact: false, checked: list.indexOf(a), brokenAt: a.id };
    prev = a.digest;
  }
  return { intact: true, checked: list.length + 1, brokenAt: null };
}

export function addendumBlock(a: Pick<Addendum, "kind" | "text" | "reason" | "author" | "createdAt">) {
  const when = new Date(a.createdAt).toLocaleString("en-US");
  const head = `${addendumTitle(a.kind).toUpperCase()} · ${a.author} · ${when}`;
  const reason = a.reason && a.kind !== "attestation" ? `\nReason: ${a.reason}` : "";
  return `${head}${reason}\n${a.text}`;
}

export async function documentText(encId: string, note: Note) {
  const sig = await artifacts.get<Signature>(encId, "signature");
  const cosign = await artifacts.get<Cosign>(encId, "cosign");
  const list = await addenda.list(encId);
  const parts = [bodyText(note)];
  if (sig) parts.push(`Signed electronically by ${sig.byName}${sig.credential ? `, ${sig.credential}` : ""} on ${new Date(sig.at).toLocaleString("en-US")}.${cosign?.status === "pending" ? ` Awaiting co-signature by ${cosign.supervisorName}.` : ""}`);
  for (const a of list) parts.push(addendumBlock(a));
  if (cosign?.status === "cosigned" && cosign.cosignedAt) parts.push(`Co-signed electronically by ${cosign.supervisorName} on ${new Date(cosign.cosignedAt).toLocaleString("en-US")}.`);
  return parts.join("\n\n");
}

export async function pendingCosigns(user: User) {
  const rows = await all<{ encounter_id: string; content: string; scheduled_at: string; reason: string }>(
    `SELECT a.encounter_id, a.content, e.scheduled_at, e.reason FROM artifacts a JOIN encounters e ON e.id = a.encounter_id WHERE a.kind = 'cosign' AND e.org_id = ? AND ${jsonText("a.content", "status")} = 'pending' AND ${jsonText("a.content", "supervisorId")} = ? ORDER BY e.scheduled_at`,
    user.orgId,
    user.id,
  );
  return rows.map((r) => ({ encounterId: r.encounter_id, cosign: JSON.parse(r.content) as Cosign, scheduledAt: r.scheduled_at, reason: r.reason }));
}
