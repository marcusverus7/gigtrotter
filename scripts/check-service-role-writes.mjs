#!/usr/bin/env node
/**
 * Guard against the silent-RLS write bug.
 *
 * Some tables deliberately allow public READS but no client writes — venues,
 * vendor_fingerprints, pro_perks. Writing to them with the session client is
 * not an error you can see: PostgREST returns success-shaped output, the row
 * simply never appears, and the calling code carries on with a null id.
 *
 * That exact bug shipped four times before anyone noticed:
 *   confirmCapture, addManualWalletItem and updateItemDetails all inserted
 *   venues with the session client, so EVERY confirmed gig had venue_id null
 *   and the map stayed empty no matter how many tickets a user captured; then
 *   ingestCapture did the same to vendor_fingerprints, so the parse cache was
 *   never populated and every re-upload paid for a fresh vision call.
 *
 * The fourth one is why this script no longer checks the file for an import.
 * pipeline.ts imported createServiceClient, used it elsewhere, and wrote to
 * vendor_fingerprints with the session client anyway — a file-level check said
 * "fine". So the check now follows the RECEIVER: which client object the write
 * is actually chained off, and whether that identifier was assigned from
 * createServiceClient().
 *
 * Still a heuristic, not a proof — reassignment and indirection defeat it —
 * but it catches every shape that has actually gone wrong here.
 *
 * Run: pnpm check:rls
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** Tables whose RLS permits reads but no client writes. */
const SERVICE_ROLE_ONLY = ["venues", "vendor_fingerprints", "pro_perks"];
const WRITE_METHODS = ["insert", "update", "upsert", "delete"];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Identifiers in this file that hold a service-role client. */
function serviceClientNames(source) {
  const names = new Set();
  const decl = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?createServiceClient\s*\(/g;
  let m;
  while ((m = decl.exec(source)) !== null) names.add(m[1]);
  return names;
}

const problems = [];

for (const file of walk(SRC)) {
  const source = readFileSync(file, "utf8");
  if (!source.includes("from(")) continue;

  const serviceNames = serviceClientNames(source);

  for (const table of SERVICE_ROLE_ONLY) {
    // Capture the receiver: `service.from("venues")`, and also the inline
    // `createServiceClient().from("venues")` form.
    const pattern = new RegExp(
      `([A-Za-z_$][\\w$]*(?:\\s*\\([^()]*\\))?)\\s*\\.from\\(\\s*["'\`]${table}["'\`]\\s*\\)`,
      "g",
    );
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const receiver = match[1];
      // A chain can span lines; 400 chars comfortably covers the call.
      const tail = source.slice(match.index, match.index + 400);
      // Stop at the next `.from(` so we do not attribute a later chain's write.
      const chain = tail.split(/\.from\(/).slice(0, 2).join(".from(");
      const writes = WRITE_METHODS.filter((m) =>
        new RegExp(`\\.${m}\\(`).test(chain),
      );
      if (writes.length === 0) continue;

      const isService =
        receiver.startsWith("createServiceClient") ||
        serviceNames.has(receiver.replace(/\s*\(.*$/, ""));
      if (isService) continue;

      const line = source.slice(0, match.index).split("\n").length;
      problems.push({
        file: relative(ROOT, file).replace(/\\/g, "/"),
        line,
        table,
        method: writes[0],
        receiver,
      });
    }
  }
}

if (problems.length > 0) {
  console.error(
    `\n✗ ${problems.length} write(s) to a service-role-only table from a client that is not the service client:\n`,
  );
  for (const p of problems) {
    console.error(
      `  ${p.file}:${p.line} — ${p.receiver}.from("${p.table}").${p.method}()`,
    );
  }
  console.error(
    "\nThese writes are silently denied by RLS: no error is raised, the row\n" +
      "never lands, and the caller continues with a null id. Use\n" +
      "createServiceClient() for these tables and surface the error.\n",
  );
  process.exit(1);
}

console.log(
  `✓ no unguarded writes to service-role-only tables (${SERVICE_ROLE_ONLY.join(", ")})`,
);
