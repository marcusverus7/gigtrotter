#!/usr/bin/env node
/**
 * Apply every supabase/migrations/*.sql to the STAGING database, in order,
 * recording what ran in public.__staging_migrations so re-runs only apply
 * new files. Staging only: refuses a connection string that does not point
 * at STAGING_PROJECT_REF, so it can never be aimed at production by mistake.
 *
 *   pnpm staging:migrate            # apply pending
 *   pnpm staging:migrate --reset    # drop public schema first (staging only)
 *
 * Reads .env.staging (gitignored): STAGING_DATABASE_URL, STAGING_PROJECT_REF.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import postgres from "postgres";

const root = process.cwd();
function loadEnv() {
  try {
    for (const line of readFileSync(join(root, ".env.staging"), "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* no file: rely on the environment */
  }
}
loadEnv();

const url = process.env.STAGING_DATABASE_URL;
const ref = process.env.STAGING_PROJECT_REF ?? "hhjjlyizrryjttxtjvcu";
if (!url) {
  console.error("STAGING_DATABASE_URL is not set (see .env.staging).");
  process.exit(2);
}
if (!url.includes(ref)) {
  console.error(`Refusing: STAGING_DATABASE_URL does not reference the staging project ${ref}.`);
  process.exit(2);
}

const sql = postgres(url, { ssl: "require", max: 1, prepare: false });
const reset = process.argv.includes("--reset");

try {
  if (reset) {
    console.log("reset: dropping and recreating schema public (staging)");
    await sql.unsafe("drop schema public cascade; create schema public; grant usage on schema public to anon, authenticated, service_role; grant all on schema public to postgres;");
    await sql.unsafe(
      "alter default privileges in schema public grant all on tables to anon, authenticated, service_role; alter default privileges in schema public grant all on functions to anon, authenticated, service_role; alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;",
    );
  }
  await sql.unsafe("create table if not exists public.__staging_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await sql`select name from public.__staging_migrations`).map((r) => r.name));
  const files = readdirSync(join(root, "supabase", "migrations"))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const body = readFileSync(join(root, "supabase", "migrations", f), "utf8");
    process.stdout.write(`applying ${f} ... `);
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into public.__staging_migrations (name) values (${f})`;
      });
      console.log("ok");
      applied += 1;
    } catch (err) {
      console.log("FAILED");
      console.error(err.message);
      process.exit(1);
    }
  }
  console.log(`done: ${applied} applied, ${files.length - applied} already present`);
} finally {
  await sql.end();
}
