import { z } from "zod";

/**
 * Dates arrive in whatever shape the source produced: the vision parser emits
 * LOCAL ISO with no offset by design ("2026-08-31T19:00:00" — the prompt says
 * drop timezones), and `<input type="datetime-local">` emits
 * "2026-08-31T19:00". A `z.string().datetime({ offset: true })` rejects BOTH,
 * which is how confirming almost any parsed capture came to throw in
 * production. Accept anything `Date.parse` understands; Postgres handles
 * offsetless ISO fine.
 *
 * Shared so the manual-add path and the confirm path cannot drift — they
 * accept the same values or the same value is valid in one place and rejected
 * in the other, which is worse than either rule on its own.
 */
export const FlexibleDate = z
  .string()
  .trim()
  .refine((s) => s === "" || !Number.isNaN(Date.parse(s)), {
    message: "Unrecognised date — use the date picker.",
  })
  .nullable();
