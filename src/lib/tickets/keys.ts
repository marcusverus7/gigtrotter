import "server-only";

import { verifyTicketCode } from "@/lib/tickets/codes";

/**
 * Ticket-signing keyring (CAP-03).
 *
 * Until 0031 the ticket HMAC borrowed CAPTURE_MASTER_KEY, so one secret did
 * two jobs and could not be rotated for one without breaking the other. The
 * keyring separates them with explicit versions:
 *
 *   v2  TICKET_SIGNING_KEY   — the purpose-specific key; new codes use it
 *                              whenever it is set.
 *   v1  CAPTURE_MASTER_KEY   — legacy; still VERIFIES every ticket issued
 *                              before the switch, never signs once v2 exists.
 *
 * Rotation: set TICKET_SIGNING_KEY (new codes move to v2 on the next deploy),
 * keep CAPTURE_MASTER_KEY until every v1 ticket's event has passed, then the
 * legacy entry can be dropped from `ticketSigningKeys()`. A code signed with
 * a key that is no longer in the ring fails closed at the scanner, which is
 * the right failure.
 */

export type SigningKey = { version: number; secret: string };

export function ticketSigningKeys(env: NodeJS.ProcessEnv = process.env): SigningKey[] {
  const ring: SigningKey[] = [];
  const v2 = env.TICKET_SIGNING_KEY?.trim();
  if (v2) ring.push({ version: 2, secret: v2 });
  const v1 = env.CAPTURE_MASTER_KEY?.trim();
  if (v1) ring.push({ version: 1, secret: v1 });
  if (ring.length === 0) {
    throw new Error("No ticket signing key: set TICKET_SIGNING_KEY (or legacy CAPTURE_MASTER_KEY).");
  }
  return ring;
}

/** The secret new codes are signed with: the newest configured key. */
export function currentSigningSecret(env: NodeJS.ProcessEnv = process.env): string {
  return ticketSigningKeys(env)[0].secret;
}

/** Verify against every key in the ring; reports which version matched. */
export function verifyTicketCodeAny(
  code: string,
  keys: SigningKey[] = ticketSigningKeys(),
): { ok: true; version: number } | { ok: false } {
  for (const k of keys) if (verifyTicketCode(code, k.secret)) return { ok: true, version: k.version };
  return { ok: false };
}
