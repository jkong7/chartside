import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "../db";

let key: Buffer | null = null;

function secretKey() {
  if (key) return key;
  let secret = process.env.CHARTSIDE_SECRET;
  if (!secret) {
    const file = path.join(dataDir(), ".secret");
    if (existsSync(file)) secret = readFileSync(file, "utf8").trim();
    else {
      mkdirSync(dataDir(), { recursive: true });
      secret = randomBytes(32).toString("hex");
      writeFileSync(file, secret, { mode: 0o600 });
    }
  }
  key = createHash("sha256").update(secret).digest();
  return key;
}

export function seal(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}

export function unseal(sealed: string) {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Invalid sealed value");
  const d = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

const BYTES_MAGIC = Buffer.from("CSB1");

export function sealBytes(plain: Buffer) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([BYTES_MAGIC, iv, c.getAuthTag(), enc]);
}

export function unsealBytes(sealed: Buffer) {
  if (sealed.length < 32 || !sealed.subarray(0, 4).equals(BYTES_MAGIC)) throw new Error("Invalid sealed bytes");
  const d = createDecipheriv("aes-256-gcm", secretKey(), sealed.subarray(4, 16));
  d.setAuthTag(sealed.subarray(16, 32));
  return Buffer.concat([d.update(sealed.subarray(32)), d.final()]);
}

export function pkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function randomState() {
  return randomBytes(24).toString("base64url");
}
