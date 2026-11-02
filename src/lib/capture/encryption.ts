import "server-only";
import { webcrypto as crypto } from "node:crypto";

import { serverEnv } from "@/lib/env";

/**
 * Capture encryption. Envelope scheme:
 *   - A 32-byte master key decrypts per-user keys. Keys are versioned
 *     (CAP-03): v1 = CAPTURE_MASTER_KEY, v2 = CAPTURE_MASTER_KEY_V2. New
 *     captures use the highest configured version and record it in
 *     captures.key_version; old blobs keep decrypting with their own version
 *     for as long as that key stays configured.
 *   - Per-user keys are derived deterministically (HKDF) so we don't need a
 *     separate keys table. The HKDF salt carries the version so v1 and v2
 *     user keys never coincide even if the master keys did.
 *   - Source captures are AES-256-GCM with a per-blob IV; the IV is prepended
 *     to the ciphertext for storage.
 *
 * Rotation (see docs/RUNBOOK-pilot.md): set CAPTURE_MASTER_KEY_V2, deploy
 * (new captures → v2), re-encrypt old blobs offline if ever required, and
 * only then retire CAPTURE_MASTER_KEY. The ticket HMAC no longer uses this
 * key at all once TICKET_SIGNING_KEY is set (src/lib/tickets/keys.ts).
 *
 * The plaintext source artefact never leaves trusted server code — clients
 * only ever see the structured parse_json and the redacted share card.
 */

function decodeBase64Key(b64: string, name: string): Uint8Array {
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 32) {
    throw new Error(`${name} must be exactly 32 bytes (base64).`);
  }
  return new Uint8Array(buf);
}

/** Master key bytes for a version, or throws when that version is not configured. */
function masterKeyFor(version: number): Uint8Array {
  if (version === 2) {
    const v2 = serverEnv.captureMasterKeyV2;
    if (!v2) throw new Error("CAPTURE_MASTER_KEY_V2 is not configured but a v2 blob was requested.");
    return decodeBase64Key(v2, "CAPTURE_MASTER_KEY_V2");
  }
  if (version === 1) return decodeBase64Key(serverEnv.captureMasterKey, "CAPTURE_MASTER_KEY");
  throw new Error(`Unknown capture key version ${version}.`);
}

/** The version new captures are written with: the newest configured key. */
export function currentCaptureKeyVersion(): number {
  return serverEnv.captureMasterKeyV2 ? 2 : 1;
}

async function deriveUserKey(userId: string, version: number): Promise<CryptoKey> {
  const master = await crypto.subtle.importKey("raw", masterKeyFor(version), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(version === 1 ? "gigtrotter-capture-v1" : `gigtrotter-capture-v${version}`),
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
  version: number = currentCaptureKeyVersion(),
): Promise<Uint8Array> {
  const key = await deriveUserKey(userId, version);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  // [iv(12)][ciphertext+tag]
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), 12);
  return out;
}

export async function decryptBytes(
  userId: string,
  payload: Uint8Array,
  version = 1,
): Promise<Uint8Array> {
  const key = await deriveUserKey(userId, version);
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
