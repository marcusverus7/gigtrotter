"use client";

import { formatLocal } from "@/lib/format-local";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * Renders an instant in the VIEWER's timezone and locale.
 *
 * Any server component that formats a time with Intl is formatting it in the
 * server's zone — UTC on Vercel — and since server output never re-renders,
 * that is permanently wrong: a 19:30 BST gig printed as "06:30 PM".
 *
 * This used to format with `undefined` locale during render and lean on
 * suppressHydrationWarning. That only hides the warning: React does not patch
 * mismatched text during hydration, so the server's UTC/en-US text stayed on
 * screen (verified in production 2026-11-09: a 17:00 BST gig showed
 * "Friday, September 4, 2026 · 04:00 PM" to a London en-GB viewer).
 *
 * Now: a fixed en-GB/UTC string for the server and hydration passes, then
 * the viewer's local one.
 */
export function LocalDateTime({
  iso,
  options,
  className,
}: {
  iso: string;
  options?: Intl.DateTimeFormatOptions;
  className?: string;
}) {
  const hydrated = useHydrated();
  const text = formatLocal(iso, options, hydrated);
  if (!text) return null;
  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  );
}
