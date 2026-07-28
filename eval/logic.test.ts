/**
 * Offline logic tests for the capture pipeline — everything that runs WITHOUT
 * an Anthropic API key. The live vision call is exercised separately by
 * `pnpm eval` (needs ANTHROPIC_API_KEY) and by uploading corpus tickets to the
 * deployed app; this file pins down the deterministic logic around the model:
 *
 *   - MIME sniffing (magic numbers) and the PDF fail-closed path
 *   - code-fence stripping of model output
 *   - the Zod contract (schema defaults + rejections)
 *   - the eval scorer (field mapping, date/string normalisation, barcode
 *     presence-only, unscored-by-design fields)
 *
 * Run: pnpm test:logic
 */

import { detectMimeType, stripCodeFence, parseCaptureBytes, ParseError } from "../src/lib/capture/parser";
import { ParsedCaptureSchema, type ParsedCapture } from "../src/lib/capture/schema";
import { fieldEquals, getPath, scoreSample, FIELD_MAP } from "./score";

let passed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed += 1;
  } else {
    failures.push(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/* ── detectMimeType ─────────────────────────────────────────────────────── */

check(
  "png magic bytes",
  detectMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47])) === "image/png",
);
check(
  "jpeg magic bytes",
  detectMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])) === "image/jpeg",
);
check(
  "webp magic bytes (RIFF)",
  detectMimeType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00])) === "image/webp",
);
check(
  "pdf magic bytes (%PDF)",
  detectMimeType(new Uint8Array([0x25, 0x50, 0x44, 0x46])) === "application/pdf",
);
check(
  "unknown bytes fall back to jpeg",
  detectMimeType(new Uint8Array([0x00, 0x01, 0x02, 0x03])) === "image/jpeg",
);

/* ── PDF fail-closed (no API call, so runs offline) ─────────────────────── */

async function testPdfRejection() {
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  await parseCaptureBytes(pdfBytes).then(
    () => check("pdf capture rejected", false, "resolved instead of throwing"),
    (err) => {
      check("pdf capture rejected", err instanceof ParseError);
      check(
        "pdf rejection carries a typed reason",
        err instanceof ParseError && err.reason === "schema_mismatch",
        err instanceof ParseError ? `reason=${err.reason}` : String(err),
      );
    },
  );
}

/* ── stripCodeFence ─────────────────────────────────────────────────────── */

check(
  "strips ```json fence",
  stripCodeFence('```json\n{"a":1}\n```') === '{"a":1}',
);
check(
  "strips bare ``` fence",
  stripCodeFence('```\n{"a":1}\n```') === '{"a":1}',
);
check(
  "leaves unfenced JSON alone",
  stripCodeFence('{"a":1}') === '{"a":1}',
);
check(
  "stripped fenced output parses as JSON",
  JSON.parse(stripCodeFence('```json\n{"kind":"ticket"}\n```')).kind === "ticket",
);

/* ── ParsedCaptureSchema (the model output contract) ────────────────────── */

const minimalValid = {
  kind: "ticket",
  title: "Gloss Hounds + Pylon",
  starts_at: "2026-07-04T20:00:00",
  ends_at: null,
  vendor: "tickethub",
  confidence: 0.92,
};
const okParse = ParsedCaptureSchema.safeParse(minimalValid);
check("minimal valid capture passes", okParse.success);
if (okParse.success) {
  check("barcode_present defaults false", okParse.data.barcode_present === false);
  check("details defaults to []", Array.isArray(okParse.data.details) && okParse.data.details.length === 0);
  check("pii_detected defaults false", okParse.data.pii_detected === false);
}
check(
  "empty title rejected",
  !ParsedCaptureSchema.safeParse({ ...minimalValid, title: "" }).success,
);
check(
  "confidence > 1 rejected",
  !ParsedCaptureSchema.safeParse({ ...minimalValid, confidence: 1.2 }).success,
);
check(
  "unknown kind rejected",
  !ParsedCaptureSchema.safeParse({ ...minimalValid, kind: "concert" }).success,
);
check(
  "iata must be 3 chars",
  !ParsedCaptureSchema.safeParse({
    ...minimalValid,
    kind: "flight",
    destination: { name: "Dublin", city: "Dublin", country: "IE", iata: "DUBL" },
  }).success,
);

/* ── fieldEquals normalisation ──────────────────────────────────────────── */

check(
  "dates equal at minute precision despite seconds/millis/Z",
  fieldEquals("2026-07-04T20:00:00", "2026-07-04T20:00:00.000Z"),
);
check(
  "dates differing by a minute are not equal",
  !fieldEquals("2026-07-04T20:00:00", "2026-07-04T20:01:00"),
);
check("strings compare case-insensitively", fieldEquals("O2 Forum", "o2 forum"));
check("strings compare accent-insensitively", fieldEquals("Café Öst", "cafe ost"));
check("whitespace is trimmed", fieldEquals("  London ", "London"));
check("different strings are unequal", !fieldEquals("London", "Leeds"));
check("non-strings compare via JSON", fieldEquals(45.1, 45.1) && !fieldEquals(45.1, 45.2));

/* ── getPath ────────────────────────────────────────────────────────────── */

const nested = { destination: { name: "O2 Forum", city: "London" } };
check("getPath resolves nested path", getPath(nested, "destination.city") === "London");
check("getPath returns undefined for missing path", getPath(nested, "origin.city") === undefined);

/* ── scoreSample end-to-end against a realistic sidecar ─────────────────── */

const parsed: ParsedCapture = {
  kind: "ticket",
  title: "Gloss Hounds + Pylon",
  starts_at: "2026-07-04T20:00:00",
  ends_at: null,
  destination: { name: "O2 Forum", city: "London", country: "GB" },
  vendor: "tickethub",
  price_total_cents: 4510,
  currency: "GBP",
  barcode_present: true,
  confidence: 0.9,
  details: ["VIP Package"],
  pii_detected: false,
};

// Sidecar in the corpus format: rich ticketing schema, incl. fields the parser
// deliberately does not extract.
const sidecar = {
  title: "Gloss Hounds + Pylon",
  artist: "Gloss Hounds",
  venue: "O2 Forum",
  city: "London",
  starts_at: "2026-07-04T20:00:00",
  doors_at: "2026-07-04T18:30:00",
  ticket_type: "VIP Package",
  order_ref: "2XSW63HY",
  barcode: "CSK4HGA9TMYLK2",
  price_total: 45.1,
  currency: "GBP",
};

const s = scoreSample(parsed, sidecar);
check(
  "perfect parse scores 100% on scored fields",
  s.fieldsChecked > 0 && s.fieldsCorrect === s.fieldsChecked,
  `got ${s.fieldsCorrect}/${s.fieldsChecked}, mismatches: ${JSON.stringify(s.mismatches)}`,
);
check(
  "designed-out fields are unscored, not failures",
  ["artist", "doors_at", "ticket_type", "order_ref"].every((f) =>
    s.unscored.includes(f),
  ),
  `unscored=${JSON.stringify(s.unscored)}`,
);
check(
  "price and currency are now scored, not unscored",
  !s.unscored.includes("price_total") && !s.unscored.includes("currency"),
  `unscored=${JSON.stringify(s.unscored)}`,
);
check(
  "scored set is title, starts_at, venue, city, barcode, price, currency",
  s.fieldsChecked === 7,
  `fieldsChecked=${s.fieldsChecked}`,
);
// Price crosses a unit boundary: sidecar 45.1 (major) vs parse 4510 (minor).
check(
  "price compared across major/minor units",
  scoreSample({ ...parsed, price_total_cents: 4510 }, { price_total: 45.1 })
    .fieldsCorrect === 1,
);
check(
  "wrong price is a mismatch, not a pass",
  scoreSample({ ...parsed, price_total_cents: 4500 }, { price_total: 45.1 })
    .mismatches.some((m) => m.field === "price_total"),
);
check(
  "missing price is a mismatch when the sidecar has one",
  scoreSample({ ...parsed, price_total_cents: null }, { price_total: 45.1 })
    .mismatches.some((m) => m.field === "price_total"),
);

// Wrong city + missing barcode must surface as mismatches.
const worse = scoreSample(
  { ...parsed, destination: { name: "O2 Forum", city: "Leeds", country: "GB" }, barcode_present: false },
  sidecar,
);
check(
  "wrong city and absent barcode are counted as mismatches",
  worse.mismatches.some((m) => m.field === "city") &&
    worse.mismatches.some((m) => m.field === "barcode"),
  JSON.stringify(worse.mismatches),
);
check(
  "mismatches reduce the correct count",
  worse.fieldsCorrect === worse.fieldsChecked - 2,
  `${worse.fieldsCorrect}/${worse.fieldsChecked}`,
);

// Null sidecar values are skipped entirely.
const skipped = scoreSample(parsed, { title: "Gloss Hounds + Pylon", venue: null });
check("null sidecar values are skipped", skipped.fieldsChecked === 1);

// Every FIELD_MAP dot-path target must exist in the ParsedCapture shape —
// guards against the scorer silently drifting from the schema.
const pathTargets = Object.values(FIELD_MAP).filter(
  (v): v is string =>
    typeof v === "string" && !v.startsWith("__"), // __barcode__/__price__ are handled specially
);
check(
  "every FIELD_MAP path resolves against a real parse",
  pathTargets.every((p) => getPath(parsed, p) !== undefined),
  `paths=${JSON.stringify(pathTargets)}`,
);

/* ── report ─────────────────────────────────────────────────────────────── */

testPdfRejection().then(() => {
  const total = passed + failures.length;
  console.log(`\ncapture logic tests: ${passed}/${total} passed`);
  for (const f of failures) console.error(f);
  if (failures.length > 0) process.exit(1);
});
