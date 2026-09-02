"use client";

/**
 * Renders an instant in the VIEWER's timezone and locale.
 *
 * Any server component that formats a time with Intl is formatting it in the
 * server's zone — UTC on Vercel — and since server output never re-renders,
 * that is not a hydration flash, it is permanently wrong: a 19:30 BST gig
 * printed as "06:30 PM" on the page a tester lands on from every wallet card.
 *
 * Client components are the one place `undefined` locale/zone means "the
 * person looking at the screen". suppressHydrationWarning covers the one-off
 * SSR/client mismatch, same as the wallet's DateLine.
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
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return (
    <span className={className} suppressHydrationWarning>
      {new Intl.DateTimeFormat(undefined, options).format(date)}
    </span>
  );
}
