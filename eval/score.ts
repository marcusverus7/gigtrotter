/**
 * Pure scoring logic for the parse-corpus eval — deliberately free of any
 * import that pulls in `server-only` (the parser), so it runs under plain
 * `tsx` and can be unit-tested in isolation.
 *
 * The answer-key sidecars use a rich ticketing schema (artist, venue, city,
 * doors_at, order_ref, barcode, price…). The parser normalises to a smaller
 * `ParsedCapture` shape. FIELD_MAP maps each sidecar field to the parser path
 * it should be scored against:
 *   - a dot-path string  → resolved against the parse (e.g. "destination.city")
 *   - "__barcode__"      → special: sidecar string presence vs `barcode_present`
 *   - null               → parser does not extract this by design; report as
 *                          unscored rather than counting it as a failure.
 */

import type { ParsedCapture } from "../src/lib/capture/schema";

export type Expected = Record<string, unknown>;

export const FIELD_MAP: Record<string, string | null> = {
  title: "title",
  starts_at: "starts_at",
  ends_at: "ends_at",
  kind: "kind",
  vendor: "vendor",
  venue: "destination.name",
  city: "destination.city",
  country: "destination.country",
  barcode: "__barcode__",
  // Sidecars carry price as a decimal (45.1); the parser emits minor units
  // (4510), so this needs a conversion rather than a plain path compare.
  price_total: "__price__",
  currency: "currency",
  // Not extracted by the current parser (live in details[] or dropped on purpose):
  artist: null,
  doors_at: null,
  ticket_type: null,
  order_ref: null,
  section: null,
  row: null,
  seat: null,
};

/** Resolve a dot-path ("destination.city") against a parsed object. */
export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function fieldEquals(expected: unknown, got: unknown): boolean {
  // Dates FIRST: compare at minute precision (YYYY-MM-DDTHH:MM), tolerant of
  // trailing seconds / millis / timezone suffixes the parser may append.
  // (Must run before the generic string compare, which would otherwise reject
  // "...T19:00:00" vs "...T19:00:00.000Z".)
  if (
    typeof expected === "string" &&
    typeof got === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(expected) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(got)
  ) {
    return expected.slice(0, 16) === got.slice(0, 16);
  }
  // Strings: lowercase + trim + accent-normalise for forgiving compares.
  if (typeof expected === "string" && typeof got === "string") {
    const norm = (s: string) =>
      s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim();
    return norm(expected) === norm(got);
  }
  return JSON.stringify(expected) === JSON.stringify(got);
}

export function scoreSample(
  parsed: ParsedCapture,
  expected: Expected,
): {
  fieldsChecked: number;
  fieldsCorrect: number;
  mismatches: { field: string; expected: unknown; got: unknown }[];
  unscored: string[];
} {
  const mismatches: { field: string; expected: unknown; got: unknown }[] = [];
  const unscored: string[] = [];
  let checked = 0;
  let correct = 0;
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (expectedValue == null) continue;

    // Unknown sidecar fields default to a same-named parser field; mapped null
    // means "parser doesn't produce this" → don't score, just report.
    const mapped = field in FIELD_MAP ? FIELD_MAP[field] : field;
    if (mapped === null) {
      unscored.push(field);
      continue;
    }

    // Price: sidecar is a decimal in major units, parser emits minor units.
    // Compared at whole-minor-unit precision to absorb float noise (45.1 * 100
    // is 4510.000000000001 in IEEE-754).
    if (mapped === "__price__") {
      checked += 1;
      const expectedCents =
        typeof expectedValue === "number" ? Math.round(expectedValue * 100) : null;
      const got = parsed.price_total_cents ?? null;
      if (expectedCents !== null && got === expectedCents) {
        correct += 1;
      } else {
        mismatches.push({ field, expected: expectedCents, got });
      }
      continue;
    }

    // Barcode: the parser only reports presence, not the value.
    if (mapped === "__barcode__") {
      checked += 1;
      const present =
        typeof expectedValue === "string"
          ? expectedValue.trim().length > 0
          : Boolean(expectedValue);
      if (Boolean(parsed.barcode_present) === present) {
        correct += 1;
      } else {
        mismatches.push({
          field,
          expected: present,
          got: parsed.barcode_present,
        });
      }
      continue;
    }

    checked += 1;
    const got = getPath(parsed, mapped);
    if (fieldEquals(expectedValue, got)) {
      correct += 1;
    } else {
      mismatches.push({ field, expected: expectedValue, got });
    }
  }
  return { fieldsChecked: checked, fieldsCorrect: correct, mismatches, unscored };
}
