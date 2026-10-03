import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Envelope encryption for third-party tokens.
 * Each record gets a fresh 256-bit data key (DEK). The DEK encrypts the payload with
 * AES-256-GCM; the master key (KEK) wraps the DEK. Swap `masterKey()` for a KMS call
 * in production without changing callers.
 *
 * Layout (base64url of): version(1) | wrapIv(12) | wrapTag(16) | wrappedDek(32) |
 *                        dataIv(12) | dataTag(16) | ciphertext
 */
const VERSION = 1;

function masterKey(): Buffer {
  const raw = process.env.ORBITA_MASTER_KEY;
  if (!raw) throw new Error("ORBITA_MASTER_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ORBITA_MASTER_KEY must be 32 bytes, base64-encoded");
  return key;
}

function gcmEncrypt(key: Buffer, plaintext: Buffer, aad: Buffer) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(aad);
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return { iv, tag: c.getAuthTag(), ct };
}

function gcmDecrypt(key: Buffer, iv: Buffer, tag: Buffer, ct: Buffer, aad: Buffer) {
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAAD(aad);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

/** `context` (e.g. "client:<id>:instagram") is bound as AAD so a blob can't be moved to another record. */
export function encryptSecret(plaintext: string, context: string): string {
  const aad = Buffer.from(context);
  const dek = randomBytes(32);
  const data = gcmEncrypt(dek, Buffer.from(plaintext, "utf8"), aad);
  const wrap = gcmEncrypt(masterKey(), dek, aad);
  return Buffer.concat([
    Buffer.from([VERSION]), wrap.iv, wrap.tag, wrap.ct, data.iv, data.tag, data.ct,
  ]).toString("base64url");
}

export function decryptSecret(blob: string, context: string): string {
  const b = Buffer.from(blob, "base64url");
  if (b[0] !== VERSION) throw new Error("Unsupported ciphertext version");
  const aad = Buffer.from(context);
  let o = 1;
  const wrapIv = b.subarray(o, (o += 12));
  const wrapTag = b.subarray(o, (o += 16));
  const wrapped = b.subarray(o, (o += 32));
  const dataIv = b.subarray(o, (o += 12));
  const dataTag = b.subarray(o, (o += 16));
  const ct = b.subarray(o);
  const dek = gcmDecrypt(masterKey(), wrapIv, wrapTag, wrapped, aad);
  return gcmDecrypt(dek, dataIv, dataTag, ct, aad).toString("utf8");
}
