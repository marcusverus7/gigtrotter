/**
 * Held-out real-ticket evaluation (CAP-02).
 *
 *   pnpm exec tsx --tsconfig eval/tsconfig.json eval/score-real.ts
 *
 * Reads eval/real/answers.json (see eval/real/README.md), runs every listed
 * fixture through the same live parser path as eval/run.ts, and reports —
 * separately for the "dev" and "heldout" splits — field coverage, critical
 * failures, complete-item correctness, latency and correction burden.
 *
 * Needs ANTHROPIC_API_KEY. Without it this prints "blocked" and exits 2:
 * a missing key is a blocked gate, not a number.
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env) && m[2].trim() !== "") process.env[m[1]] = m[2].trim();
  }
}

import { parseCaptureBytes, ParseError } from "../src/lib/capture/parser";
import type { ParsedCapture } from "../src/lib/capture/schema";
import { classifyIssuer } from "../src/lib/tickets/issuer";
import { fieldEquals, FIELD_MAP, getPath } from "./score";

const REAL_DIR = join(process.cwd(), "eval", "real");
const REPORTS_DIR = join(process.cwd(), "eval", "reports");

type Split = "dev" | "heldout";

type AnswerItem = {
  file: string;
  split: Split;
  issuer: string;
  expected: Record<string, unknown>;
  critical?: string[];
};

type AnswerKey = { provenance?: string; items: AnswerItem[] };

type FieldResult = { field: string; expected: unknown; got: unknown; ok: boolean; present: boolean; critical: boolean };

type ItemResult = {
  item: AnswerItem;
  ok: boolean;
  error?: string;
  durationMs: number;
  fields: FieldResult[];
  parsed?: ParsedCapture;
};

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Resolve one expected field against the parse. entry_mode goes through the issuer classifier. */
function resolveField(field: string, parsed: ParsedCapture): { got: unknown; present: boolean } {
  if (field === "entry_mode") {
    const info = classifyIssuer(parsed.vendor, [parsed.title, ...(parsed.details ?? [])]);
    return { got: info.entryMode, present: info.entryMode !== "unknown" };
  }
  const path = FIELD_MAP[field];
  if (path === "__barcode__") return { got: parsed.barcode_present, present: true };
  if (path === "__price__") {
    const cents = parsed.price_total_cents;
    return { got: cents == null ? null : cents / 100, present: cents != null };
  }
  const got = getPath(parsed, path ?? field);
  return { got, present: got !== null && got !== undefined && got !== "" };
}

function scoreItem(item: AnswerItem, parsed: ParsedCapture): FieldResult[] {
  const critical = new Set(item.critical ?? []);
  return Object.entries(item.expected).map(([field, expected]) => {
    const { got, present } = resolveField(field, parsed);
    return { field, expected, got, ok: present && fieldEquals(expected, got), present, critical: critical.has(field) };
  });
}

async function runItem(item: AnswerItem): Promise<ItemResult> {
  const path = join(REAL_DIR, item.file);
  if (!existsSync(path)) {
    return { item, ok: false, error: "fixture file missing", durationMs: 0, fields: [] };
  }
  const bytes = new Uint8Array(await readFile(path));
  const t0 = Date.now();
  try {
    const parsed = await parseCaptureBytes(bytes);
    return { item, ok: true, durationMs: Date.now() - t0, fields: scoreItem(item, parsed), parsed };
  } catch (err) {
    const error =
      err instanceof ParseError
        ? `${err.reason}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    // Every expected field counts as a miss when nothing parsed; a crashed
    // parse must not shrink the denominator (see eval/README.md on the BOM bug).
    const critical = new Set(item.critical ?? []);
    const fields = Object.entries(item.expected).map(([field, expected]) => ({
      field,
      expected,
      got: null,
      ok: false,
      present: false,
      critical: critical.has(field),
    }));
    return { item, ok: false, error, durationMs: Date.now() - t0, fields };
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

function summarise(results: ItemResult[]): string[] {
  const out: string[] = [];
  const n = results.length;
  if (n === 0) return ["_no items_", ""];
  const allFields = results.flatMap((r) => r.fields);
  const checked = allFields.length;
  const present = allFields.filter((f) => f.present).length;
  const correct = allFields.filter((f) => f.ok).length;
  const criticalFields = allFields.filter((f) => f.critical);
  const criticalFailures = results.flatMap((r) =>
    r.fields.filter((f) => f.critical && !f.ok).map((f) => ({ file: r.item.file, field: f.field, expected: f.expected, got: f.got })),
  );
  const complete = results.filter((r) => r.ok && r.fields.every((f) => f.ok)).length;
  const parsedClean = results.filter((r) => r.ok).length;
  const durations = results.filter((r) => r.ok).map((r) => r.durationMs);
  const burden = results.map((r) => r.fields.filter((f) => !f.ok).length);
  const avgBurden = burden.reduce((a, b) => a + b, 0) / n;

  const pct = (a: number, b: number) => (b > 0 ? ` (${((100 * a) / b).toFixed(1)}%)` : "");
  out.push(`- Items: **${n}** · parsed cleanly: **${parsedClean}/${n}**`);
  out.push(`- Field coverage (parser returned a value): **${present}/${checked}**${pct(present, checked)}`);
  out.push(`- Field correctness: **${correct}/${checked}**${pct(correct, checked)}`);
  out.push(
    `- Critical fields (date/time, venue, entry mode): **${criticalFields.filter((f) => f.ok).length}/${criticalFields.length}** correct · **${criticalFailures.length} failure${criticalFailures.length === 1 ? "" : "s"}**`,
  );
  for (const f of criticalFailures) {
    out.push(`  - ${f.file} · \`${f.field}\` expected \`${JSON.stringify(f.expected)}\` got \`${JSON.stringify(f.got)}\``);
  }
  out.push(`- Complete items (every expected field right): **${complete}/${n}**${pct(complete, n)}`);
  out.push(
    `- Latency: avg ${durations.length ? (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(0) : "—"} ms · p50 ${percentile(durations, 50)} ms · max ${durations.length ? Math.max(...durations) : 0} ms`,
  );
  out.push(`- Correction burden: **${avgBurden.toFixed(2)} fields per ticket** the user would have to fix (${burden.filter((b) => b === 0).length} need none)`);
  out.push("");
  out.push("| File | Parsed | Confidence | Fields | Wrong / missing | ms |");
  out.push("| --- | --- | --- | --- | --- | --- |");
  for (const r of results) {
    const ok = r.fields.filter((f) => f.ok).length;
    const wrong = r.fields.filter((f) => !f.ok).map((f) => `\`${f.field}\`${f.critical ? "!" : ""}`).join(", ");
    const conf = r.parsed ? `${((r.parsed.confidence ?? 0) * 100).toFixed(0)}%` : "—";
    out.push(`| ${r.item.file} | ${r.ok ? "✓" : `✗ ${r.error}`} | ${conf} | ${ok}/${r.fields.length} | ${wrong || "—"} | ${r.durationMs} |`);
  }
  out.push("");
  return out;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("blocked: no ANTHROPIC_API_KEY — real-fixture scoring needs the live parser and is not run.");
    process.exit(2);
  }
  const answersPath = join(REAL_DIR, "answers.json");
  if (!existsSync(answersPath)) {
    console.error(`blocked: no ${answersPath} — see eval/real/README.md for the answer-key format.`);
    process.exit(2);
  }
  const key = JSON.parse(readFileSync(answersPath, "utf8").replace(/^﻿/, "")) as AnswerKey;
  if (!Array.isArray(key.items) || key.items.length === 0) {
    console.error("blocked: answers.json has no items.");
    process.exit(2);
  }
  for (const it of key.items) {
    if (it.split !== "dev" && it.split !== "heldout") {
      console.error(`answers.json: ${it.file} has split "${String(it.split)}"; must be "dev" or "heldout".`);
      process.exit(1);
    }
  }

  console.log(`real fixtures: ${key.items.length} items (${key.items.filter((i) => i.split === "heldout").length} held out)`);
  const results: ItemResult[] = [];
  for (const item of key.items) {
    const r = await runItem(item);
    const ok = r.fields.filter((f) => f.ok).length;
    console.log(`  ${r.ok ? "✓" : "✗"} [${item.split}] ${item.file} ${ok}/${r.fields.length} ${r.durationMs}ms${r.error ? ` — ${r.error}` : ""}`);
    results.push(r);
  }

  const out: string[] = [];
  out.push(`# Real-ticket eval — ${new Date().toISOString()}`);
  out.push("");
  out.push(`**Provenance:** ${key.provenance ?? "_not stated in answers.json_"}`);
  out.push(`**Corpus:** ${results.length} real, redacted fixtures · ${results.filter((r) => r.item.split === "heldout").length} held out · ${results.filter((r) => r.item.split === "dev").length} dev`);
  out.push("");
  out.push("> Only the fields listed in each item's `expected` are scored. Fields the parser does not extract by design are not in the denominator. These numbers are NOT comparable with the synthetic-corpus figure in eval/README.md.");
  out.push("");
  out.push("## Held-out split");
  out.push("");
  out.push(...summarise(results.filter((r) => r.item.split === "heldout")));
  out.push("## Dev split");
  out.push("");
  out.push(...summarise(results.filter((r) => r.item.split === "dev")));
  out.push("<details><summary>Raw parses</summary>");
  out.push("");
  out.push("```json");
  out.push(JSON.stringify(results.map((r) => ({ file: r.item.file, split: r.item.split, parsed: r.parsed, fields: r.fields })), null, 2));
  out.push("```");
  out.push("");
  out.push("</details>");

  if (!existsSync(REPORTS_DIR)) await mkdir(REPORTS_DIR, { recursive: true });
  const reportPath = join(REPORTS_DIR, `real-${stamp()}.md`);
  await writeFile(reportPath, out.join("\n"), "utf8");

  const heldout = results.filter((r) => r.item.split === "heldout");
  const criticalFailures = heldout.flatMap((r) => r.fields.filter((f) => f.critical && !f.ok));
  console.log(`\nheld-out critical failures: ${criticalFailures.length}`);
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
