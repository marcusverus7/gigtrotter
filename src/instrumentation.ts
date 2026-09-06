/**
 * Server-error reporting.
 *
 * Next calls `onRequestError` for every unhandled error thrown while
 * rendering or handling a request — the ones a user sees as "Something went
 * wrong" with a `ref:` digest and nothing else. Until now that digest went
 * nowhere the owner would ever look: no Sentry is installed (the DSN in
 * env.ts is read and never used), and the default stack lands in Vercel's
 * runtime log unlabelled among everything else.
 *
 * This costs no dependency and no service. It writes ONE line per failure,
 * prefixed like every other server log in this codebase, carrying the digest
 * the user can read off their screen — so "it said ref 3f9a2b" becomes a log
 * search rather than a guess. When a real reporting service is wired later,
 * this is where it hooks in.
 *
 * The digest is what Next shows the user; `request.path` and the router kind
 * say where it happened. No request body, headers or user id: this line ends
 * up in a log the app's own privacy rules do not cover.
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; renderSource?: string },
) {
  const e = err as { digest?: string; message?: string; stack?: string };
  console.error(
    "[error] unhandled",
    JSON.stringify({
      digest: e?.digest ?? null,
      message: e?.message ?? String(err),
      method: request.method,
      path: request.path,
      route: context.routePath,
      routerKind: context.routerKind,
      renderSource: context.renderSource ?? null,
    }),
  );
  if (e?.stack) console.error(e.stack);
}
