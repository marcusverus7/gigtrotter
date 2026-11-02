/**
 * Ticket codes. PURE core (HMAC over a random body) — tested with a fixed
 * secret; the server wrapper supplies the real one.
 *
 * A code is `GT-<body>-<sig>`: a random 10-character body and a 6-character
 * signature. The signature means a code that was never issued fails at the
 * scanner before the database is consulted, and a code can be read off a
 * screen or typed in a dark doorway without ambiguity (no 0/O, 1/I/L).
 * The database row is still the source of truth for "already used".
 */

import { createHmac, randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 symbols, no look-alikes

function fromBytes(bytes: Uint8Array, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function signBody(body: string, secret: string): string {
  const mac = createHmac("sha256", secret).update(`ticket:${body}`).digest();
  return fromBytes(mac, 6);
}

export function makeTicketCode(secret: string): string {
  const body = fromBytes(randomBytes(10), 10);
  return `GT-${body.slice(0, 5)}-${body.slice(5)}-${signBody(body, secret)}`;
}

/** Normalise what a human typed: case, spaces, hyphens. */
export function normaliseCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = /^GT([A-Z0-9]{10})([A-Z0-9]{6})$/.exec(raw);
  if (!m) return raw;
  return `GT-${m[1].slice(0, 5)}-${m[1].slice(5)}-${m[2]}`;
}

export function verifyTicketCode(code: string, secret: string): boolean {
  const m = /^GT-([A-Z0-9]{5})-([A-Z0-9]{5})-([A-Z0-9]{6})$/.exec(normaliseCode(code));
  if (!m) return false;
  return signBody(m[1] + m[2], secret) === m[3];
}
