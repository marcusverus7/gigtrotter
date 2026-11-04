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

/** Legal entity that operates the service (owner confirmed 2026-11-04: sole trader). */
export const LEGAL_ENTITY = "Mark Loughran, trading as GigTrotter";
