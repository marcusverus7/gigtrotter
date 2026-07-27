/**
 * Score externally-produced parses against the corpus answer keys.
 *
 * `pnpm eval` runs the parser via the Anthropic API. This runner covers the
 * complementary case: parse JSON produced by any other route — a Claude
 * session reading the images directly, a different model, a human — dropped
 * into a JSON file, then validated with the REAL ParsedCaptureSchema and
 * scored with the REAL scorer, so the numbers are comparable with pnpm eval.
 *
 * Usage:
 *   pnpm tsx --tsconfig eval/tsconfig.json eval/score-external.ts <parses.json>
 *
 * parses.json shape: [{ "image": "tickethub/ticket_003_pdf.png", "parse": {…} }]
 */

import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

import { ParsedCaptureSchema } from "../src/lib/capture/schema";
import { scoreSample, type Expected } from "./score";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: tsx eval/score-external.ts <parses.json>");
  process.exit(1);
}

type Entry = { image: string; parse: unknown };
const entries: Entry[] = JSON.parse(readFileSync(inputPath, "utf8"));

let checked = 0;
let correct = 0;
let schemaFailures = 0;

for (const { image, parse } of entries) {
  const validated = ParsedCaptureSchema.safeParse(parse);
  if (!validated.success) {
    schemaFailures += 1;
    console.log(`✗ ${image} — parse fails ParsedCaptureSchema:`);
    console.log(`    ${validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    continue;
  }

  const expectedPath = join(
    process.cwd(),
    "eval",
    "captures",
    image.replace(extname(image), ".expected.json"),
  );
  if (!existsSync(expectedPath)) {
    console.log(`• ${image} — schema OK, no answer key, skipped scoring`);
    continue;
  }
  const expected = JSON.parse(readFileSync(expectedPath, "utf8")) as Expected;

  const s = scoreSample(validated.data, expected);
  checked += s.fieldsChecked;
  correct += s.fieldsCorrect;

  const line =
    s.mismatches.length === 0
      ? `✓ ${image} — ${s.fieldsCorrect}/${s.fieldsChecked}`
      : `~ ${image} — ${s.fieldsCorrect}/${s.fieldsChecked}`;
  console.log(line);
  for (const m of s.mismatches) {
    console.log(`    mismatch ${m.field}: expected ${JSON.stringify(m.expected)}, got ${JSON.stringify(m.got)}`);
  }
}

console.log(
  `\nTOTAL: ${correct}/${checked} fields (${checked ? ((100 * correct) / checked).toFixed(1) : "—"}%) · schema failures: ${schemaFailures}`,
);
process.exit(schemaFailures > 0 ? 1 : 0);
