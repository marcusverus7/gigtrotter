#!/usr/bin/env node
/**
 * Data snapshot and restore for a Supabase database, without pg_dump
 * (not installed on the owner's machine; Free plan has no dashboard backups).
 *
 *   node scripts/db-snapshot.mjs dump    --env PRODUCTION_DATABASE_URL --out backups/2026-11-02
 *   node scripts/db-snapshot.mjs restore --env STAGING_DATABASE_URL    --in  backups/2026-11-02
 *
 * dump:    one CSV per table in schema public (COPY TO), plus tables.json
 *          with the row counts. Data only: the schema comes from
 *          supabase/migrations (apply them first on restore).
 * restore: truncates each listed table on the TARGET and COPYs the CSV back
 *          in, with triggers disabled for the load (foreign keys are
 *          checked again when they are re-enabled). Refuses to restore into
 *          a URL that contains the production project ref unless
 *          --i-mean-production is given.
 *
 * Connection strings come from .env.staging / .env.local / the environment
 * by the variable name you pass to --env; the value is never printed.
 */
import { createWriteStream, createReadStream, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

import postgres from "postgres";

const PRODUCTION_REF = "zekwvsbxksgtofnpapmh";

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
for (const f of [".env.staging", ".env.local"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const envName = opt("--env", "STAGING_DATABASE_URL");
const url = process.env[envName];
if (!cmd || !["dump", "restore"].includes(cmd) || !url) {
  console.error("usage: db-snapshot.mjs dump|restore --env VAR_NAME [--out dir | --in dir]");
  console.error(`(${envName} is ${url ? "set" : "NOT set"})`);
  process.exit(2);
}
if (cmd === "restore" && url.includes(PRODUCTION_REF) && !args.includes("--i-mean-production")) {
  console.error("Refusing to restore into production without --i-mean-production.");
  process.exit(2);
}

const sql = postgres(url, { ssl: "require", max: 1, prepare: false });

async function listTables() {
  const rows = await sql`
    select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
       and table_name not like '\\_\\_%' and table_name <> 'spatial_ref_sys'
     order by table_name`;
  return rows.map((r) => r.table_name);
}

try {
  if (cmd === "dump") {
    const out = opt("--out", `backups/${new Date().toISOString().slice(0, 10)}`);
    mkdirSync(out, { recursive: true });
    const tables = await listTables();
    const manifest = {};
    for (const t of tables) {
      const [{ n }] = await sql.unsafe(`select count(*)::int as n from public."${t}"`);
      manifest[t] = n;
      const readable = await sql.unsafe(`copy (select * from public."${t}") to stdout with (format csv, header)`).readable();
      await pipeline(readable, createWriteStream(join(out, `${t}.csv`)));
      console.log(`${t}: ${n} rows`);
    }
    writeFileSync(join(out, "tables.json"), JSON.stringify({ at: new Date().toISOString(), tables: manifest }, null, 2));
    console.log(`dumped ${tables.length} tables to ${out}`);
  } else {
    const dir = opt("--in");
    if (!dir) throw new Error("--in <dir> required");
    const manifest = JSON.parse(readFileSync(join(dir, "tables.json"), "utf8"));
    const names = Object.keys(manifest.tables);
    await sql.unsafe("set session_replication_role = replica"); // skip triggers + FK checks during load
    for (const t of names) {
      await sql.unsafe(`truncate table public."${t}" cascade`);
      const writable = await sql.unsafe(`copy public."${t}" from stdin with (format csv, header)`).writable();
      await pipeline(createReadStream(join(dir, `${t}.csv`)), writable);
      const [{ n }] = await sql.unsafe(`select count(*)::int as n from public."${t}"`);
      console.log(`${t}: ${n} rows (snapshot had ${manifest.tables[t]})`);
    }
    await sql.unsafe("set session_replication_role = default");
    console.log(`restored ${names.length} tables from ${dir}`);
  }
} finally {
  await sql.end();
}
