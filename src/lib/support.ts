/**
 * The support contact shown on the public pages. Read from SUPPORT_EMAIL at
 * request time; when it is unset the pages say the contact is still to be
 * confirmed rather than printing an address nobody reads. Server-only by
 * usage (public pages are server components); no "server-only" import so
 * the helper stays importable from eval scripts.
 */
export function supportEmail(): string | null {
  const v = process.env.SUPPORT_EMAIL?.trim() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

/** Legal entity that operates the service. Owner has not confirmed it yet. */
export const LEGAL_ENTITY = "GigTrotter (legal entity to be confirmed by the owner)";
