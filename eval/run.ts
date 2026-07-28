/**
 * Parse-corpus eval harness.
 *
 * Usage:
 *   pnpm tsx eval/run.ts                # all vendors
 *   pnpm tsx eval/run.ts ryanair        # one vendor only
 *
 * Reads images from `eval/captures/<vendor>/*.{png,jpg,jpeg,webp}` and runs
 * each through the live parser (Claude vision via @/lib/capture/parser).
 * Writes a markdown report to `eval/reports/<ISO-date>.md` with per-vendor
 * and per-field accuracy plus the raw parse JSON for every sample.
 *
 * This is the week-two go/no-go signal from §6.1 of the strategic plan —
 * parsing reliability is the bet.
 *
 * Side-by-side with each image you can drop a `<filename>.expected.json`
 * file under the same vendor folder containing the ground truth (any
 * subset of ParsedCapture fields). The harness scores only fields you
 * provided expected values for — so you don't have to label every detail
 * to get meaningful numbers.
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

// tsx does not auto-load .env.local, so hydrate process.env from it here.
// (Static imports hoist above this block, but that's fine — the parser reads
// its env lazily at call time, not at import time.) Shell env values win.
const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env) && m[2].trim() !== "") {
      process.env[m[1]] = m[2].trim();
    }
  }
}

import { parseCaptureBytes, ParseError } from "../src/lib/capture/parser";
import type { ParsedCapture } from "../src/lib/capture/schema";
import { scoreSample, type Expected } from "./score";

const CAPTURES_DIR = join(process.cwd(), "eval", "captures");
const REPORTS_DIR = join(process.cwd(), "eval", "reports");
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

type SampleResult = {
  vendor: string;
  filename: string;
  ok: boolean;
  durationMs: number;
  parsed?: ParsedCapture;
  expected?: Expected;
  fieldsChecked: number;
  fieldsCorrect: number;
  mismatches: { field: string; expected: unknown; got: unknown }[];
  unscored: string[];
  error?: string;
};

function isoStamp(): string {
  // Avoid Date.now() incompatibility — use ISO directly
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function listVendors(only?: string): Promise<string[]> {
  if (only) return [only];
  const entries = await readdir(CAPTURES_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name);
}

async function listImages(vendor: string): Promise<string[]> {
  const dir = join(CAPTURES_DIR, vendor);
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  return files
    .filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()))
    .map((f) => join(dir, f));
}

async function loadExpected(imagePath: string): Promise<Expected | undefined> {
  const expectedPath = imagePath.replace(extname(imagePath), ".expected.json");
  if (!existsSync(expectedPath)) return undefined;
  const raw = await readFile(expectedPath, "utf8");
  try {
    // Strip a UTF-8 BOM before parsing. Windows editors and
    // `Set-Content -Encoding utf8` (PowerShell 5.1) both write one, and
    // JSON.parse rejects it.
    return JSON.parse(raw.replace(/^﻿/, "")) as Expected;
  } catch (err) {
    // Loudly. A silently-skipped answer key removes checks from the
    // denominator, so a corrupted sidecar makes the score go UP — the worst
    // possible failure mode for an eval harness. This cost a bogus 94.3%
    // (computed over 10 of 36 samples) before it was caught.
    console.error(
      `  !! UNREADABLE SIDECAR ${basename(expectedPath)} — this sample will be UNSCORED: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return undefined;
  }
}

// Scoring helpers (fieldEquals / FIELD_MAP / getPath / scoreSample) live in
// ./score — a parser-free module so they run under tsx and are unit-testable.

async function runOne(vendor: string, imagePath: string): Promise<SampleResult> {
  const bytes = new Uint8Array(await readFile(imagePath));
  const expected = await loadExpected(imagePath);
  const t0 = Date.now();
  try {
    const parsed = await parseCaptureBytes(bytes);
    const elapsed = Date.now() - t0;
    const scored = expected
      ? scoreSample(parsed, expected)
      : { fieldsChecked: 0, fieldsCorrect: 0, mismatches: [], unscored: [] };
    return {
      vendor,
      filename: basename(imagePath),
      ok: true,
      durationMs: elapsed,
      parsed,
      expected,
      ...scored,
    };
  } catch (err) {
    return {
      vendor,
      filename: basename(imagePath),
      ok: false,
      durationMs: Date.now() - t0,
      fieldsChecked: 0,
      fieldsCorrect: 0,
      mismatches: [],
      unscored: [],
      error:
        err instanceof ParseError
          ? `${err.reason}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err),
    };
  }
}

function renderReport(results: SampleResult[]): string {
  const byVendor = new Map<string, SampleResult[]>();
  for (const r of results) {
    const list = byVendor.get(r.vendor) ?? [];
    list.push(r);
    byVendor.set(r.vendor, list);
  }

  const total = results.length;
  const succeeded = results.filter((r) => r.ok).length;
  const checked = results.reduce((a, r) => a + r.fieldsChecked, 0);
  const correct = results.reduce((a, r) => a + r.fieldsCorrect, 0);
  const avgMs =
    results.reduce((a, r) => a + r.durationMs, 0) / Math.max(1, total);

  const out: string[] = [];
  out.push(`# Parse-corpus eval — ${new Date().toISOString()}`);
  out.push("");
  out.push(`**Samples:** ${total} · **Parsed cleanly:** ${succeeded}/${total}`);
  out.push(
    `**Field accuracy:** ${correct}/${checked || "—"}${
      checked > 0 ? ` (${((100 * correct) / checked).toFixed(1)}%)` : ""
    }`,
  );
  out.push(`**Avg parse latency:** ${avgMs.toFixed(0)} ms`);
  const unscoredUnion = [...new Set(results.flatMap((r) => r.unscored))].sort();
  if (unscoredUnion.length > 0) {
    out.push("");
    out.push(
      `> **Not scored** (parser doesn't extract these by design — they'd surface in \`details[]\`): ${unscoredUnion
        .map((f) => `\`${f}\``)
        .join(", ")}`,
    );
  }
  out.push("");
  out.push("---");
  out.push("");

  for (const [vendor, list] of byVendor) {
    const v_ok = list.filter((r) => r.ok).length;
    const v_checked = list.reduce((a, r) => a + r.fieldsChecked, 0);
    const v_correct = list.reduce((a, r) => a + r.fieldsCorrect, 0);
    out.push(`## ${vendor}`);
    out.push("");
    out.push(
      `${v_ok}/${list.length} parsed · ${v_correct}/${v_checked || "—"} fields correct`,
    );
    out.push("");
    out.push("| File | Parsed | Confidence | Acc. | Mismatches |");
    out.push("| --- | --- | --- | --- | --- |");
    for (const r of list) {
      const acc =
        r.fieldsChecked > 0
          ? `${r.fieldsCorrect}/${r.fieldsChecked}`
          : "—";
      const conf = r.parsed
        ? `${((r.parsed.confidence ?? 0) * 100).toFixed(0)}%`
        : "—";
      const mismatches = r.mismatches
        .map((m) => `\`${m.field}\``)
        .join(", ");
      const status = r.ok ? "✓" : `✗ ${r.error}`;
      out.push(
        `| ${r.filename} | ${status} | ${conf} | ${acc} | ${mismatches || "—"} |`,
      );
    }
    out.push("");

    // Dump raw parses for inspection.
    out.push("<details><summary>Raw parses</summary>");
    out.push("");
    out.push("```json");
    out.push(
      JSON.stringify(
        list.map((r) => ({
          file: r.filename,
          parsed: r.parsed,
          expected: r.expected,
          mismatches: r.mismatches,
        })),
        null,
        2,
      ),
    );
    out.push("```");
    out.push("");
    out.push("</details>");
    out.push("");
  }

  return out.join("\n");
}

async function main() {
  const arg = process.argv[2];
  const vendors = await listVendors(arg);

  if (vendors.length === 0) {
    console.error(
      "No vendor folders found in eval/captures/. Drop screenshots into eval/captures/<vendor>/ first — see eval/README.md.",
    );
    process.exit(1);
  }

  const results: SampleResult[] = [];
  for (const vendor of vendors) {
    const images = await listImages(vendor);
    if (images.length === 0) {
      console.warn(`[${vendor}] no images found`);
      continue;
    }
    console.log(`[${vendor}] running ${images.length} samples…`);
    for (const img of images) {
      const r = await runOne(vendor, img);
      console.log(
        `  ${r.ok ? "✓" : "✗"} ${basename(img)} ${
          r.fieldsChecked
            ? `(${r.fieldsCorrect}/${r.fieldsChecked} correct)`
            : ""
        } ${r.durationMs}ms${r.error ? ` — ${r.error}` : ""}`,
      );
      results.push(r);
    }
  }

  if (!existsSync(REPORTS_DIR)) {
    await mkdir(REPORTS_DIR, { recursive: true });
  }
  const reportPath = join(REPORTS_DIR, `${isoStamp()}.md`);
  await writeFile(reportPath, renderReport(results), "utf8");
  console.log(`\nReport: ${reportPath}`);
}

// Only run when invoked directly (`tsx eval/run.ts`), so the scoring helpers
// above can be imported by an offline test without triggering a full run.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
