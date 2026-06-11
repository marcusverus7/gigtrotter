import "server-only";
import { webcrypto as crypto } from "node:crypto";

import { serverEnv } from "@/lib/env";

/**
 * Capture encryption. Envelope scheme:
 *   - A 32-byte master key (env: CAPTURE_MASTER_KEY) decrypts per-user keys.
 *   - Per-user keys are derived deterministically (HKDF) so we don't need a
 *     separate keys table for phase 2. Phase 8 can move to a rotated key
 *     table without changing call sites.
 *   - Source captures are AES-256-GCM with a per-blob IV; the IV is prepended
 *     to the ciphertext for storage.
 *
 * The plaintext source artefact never leaves trusted server code — clients
 * only ever see the structured parse_json and the redacted share card.
 */

function decodeBase64Key(b64: string): Uint8Array {
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 32) {
    throw new Error("CAPTURE_MASTER_KEY must be exactly 32 bytes (base64).");
  }
  return new Uint8Array(buf);
}

async function deriveUserKey(userId: string): Promise<CryptoKey> {
  const master = await crypto.subtle.importKey(
    "raw",
    decodeBase64Key(serverEnv.captureMasterKey),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("gigtrotter-capture-v1"),
      info: new TextEncoder().encode(userId),
    },
    master,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBytes(
  userId: string,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const key = await deriveUserKey(userId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );
  // [iv(12)][ciphertext+tag]
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), 12);
  return out;
}

export async function decryptBytes(
  userId: string,
  payload: Uint8Array,
): Promise<Uint8Array> {
  const key = await deriveUserKey(userId);
  const iv = payload.subarray(0, 12);
  const ct = payload.subarray(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new Uint8Array(pt);
}

/** Perceptual-ish hash for vendor template caching (sha-256 of the bytes). */
export async function templateHash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
