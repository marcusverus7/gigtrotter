/**
 * PostgREST array-literal encoding for text[] filters.
 *
 * postgrest-js encodes `.overlaps(col, [..])` and `.contains(col, [..])` as
 * `{a,b}` with NO quoting, so an element holding a comma splits in two and a
 * double quote breaks the literal outright — Postgres answers 22P02
 * "malformed array literal", PostgREST turns that into a 400, and the query
 * "returns" nothing. Followed artist names are user-typed ("Earth, Wind &
 * Fire", '"Weird Al" Yankovic'), so every array filter driven by them goes
 * through this. Passing a string makes postgrest-js send it verbatim, which
 * is its documented escape hatch.
 *
 * Postgres array syntax: elements double-quoted, with a backslash escaping a
 * double quote or another backslash. Pure — tested in eval/logic.test.ts.
 */
export function pgTextArray(values: readonly string[]): string {
  return `{${values
    .map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",")}}`;
}

/**
 * Make a user-supplied string safe to pass to `.ilike()`.
 *
 * `.ilike(col, value)` sends the value as the PATTERN, so `%` and `_` in it
 * are wildcards, not characters: `?city=%` on the events page matched all
 * 5,142 events while the "All" chip stayed unhighlighted, and `?city=L%`
 * quietly merged Leeds, Liverpool and London under a chip claiming one city.
 *
 * Backslash-escaping them does NOT work, which is only obvious if you try it
 * against the real API: PostgREST consumes the backslash in its own operand
 * parser, so `ilike.\%` reaches Postgres as plain `%` and still matches
 * everything. Verified against production, 2026-09-05. So the wildcards are
 * removed rather than escaped — no UK or Irish city name contains one, and a
 * value that was nothing but wildcards becomes empty, which the caller reads
 * as "no filter". This matches how searchEvents already sanitises its input.
 *
 * Not a security boundary — RLS is — but without it the page disagrees with
 * itself about what it is showing.
 */
export function stripLikeWildcards(value: string): string {
  return value.replace(/[%_\\]/g, "").trim();
}
