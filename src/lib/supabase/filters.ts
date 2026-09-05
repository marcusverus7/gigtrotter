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
