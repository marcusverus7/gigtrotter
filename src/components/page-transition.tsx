/**
 * Page-entry fade. This used to be framer-motion's <motion.div> — the ONLY
 * framer-motion usage in the app, and because it wraps every page via the
 * layout it kept the whole library (~40KB gz) in the shared client bundle.
 * The same quarter-second fade-up is four lines of CSS (`animate-page-in`,
 * defined in globals.css, which also respects prefers-reduced-motion).
 * No longer a client component at all.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
