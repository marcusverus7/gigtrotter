/**
 * Formats an instant for display, in two modes:
 *
 *  - before hydration (server render + hydration pass): a FIXED locale and
 *    zone (en-GB, UTC unless the caller pins a zone), so the server's HTML and
 *    the browser's first render are byte-identical;
 *  - after hydration: the viewer's own locale and time zone.
 *
 * Pair with useHydrated(). Never pass `undefined` locale during render
 * without it — that is the server's en-US/UTC on Vercel.
 */
export function formatLocal(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions | undefined,
  hydrated: boolean,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return hydrated
    ? new Intl.DateTimeFormat(undefined, options).format(date)
    : new Intl.DateTimeFormat("en-GB", {
        ...options,
        timeZone: options?.timeZone ?? "UTC",
      }).format(date);
}
