#!/usr/bin/env node
/**
 * Apply every supabase/migrations/*.sql in order, recording what ran so
 * re-runs only apply new files.
 *
 *   pnpm staging:migrate                         # staging (.env.staging), ledger __staging_migrations
 *   pnpm staging:migrate --reset                 # staging only: drop public schema first
 *   node scripts/staging-migrate.mjs --target production
 *        # production: reads .env.local (PRODUCTION_DB_PASSWORD + PRODUCTION_DATABASE_URL_TEMPLATE,
 *        #  or a full PRODUCTION_DATABASE_URL); ledger __migrations; 0001-0030 are seeded as
 *        #  already applied (they were pasted by hand); a data snapshot is written to backups/
 *        #  before anything runs; --reset is refused.
 *
 * Each target refuses a connection string that does not contain its own
 * project ref, so the two can never be swapped by mistake.
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

// Accept either a full STAGING_DATABASE_URL or just STAGING_DB_PASSWORD plus the
// template the dashboard shows (with [YOUR-PASSWORD] in it), so the owner
// only ever pastes the password.
if (!process.env.STAGING_DATABASE_URL && process.env.STAGING_DB_PASSWORD && process.env.STAGING_DATABASE_URL_TEMPLATE) {
  process.env.STAGING_DATABASE_URL = process.env.STAGING_DATABASE_URL_TEMPLATE.replace(
    "[YOUR-PASSWORD]",
    encodeURIComponent(process.env.STAGING_DB_PASSWORD),
  );
}

const targetIdx = process.argv.indexOf("--target");
const target = targetIdx >= 0 ? process.argv[targetIdx + 1] : "staging";
const isProd = target === "production";
if (isProd) {
  let local = [];
  try { local = readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/); } catch { /* none */ }
  for (const line of local) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  if (!process.env.PRODUCTION_DATABASE_URL && process.env.PRODUCTION_DB_PASSWORD && process.env.PRODUCTION_DATABASE_URL_TEMPLATE) {
    process.env.PRODUCTION_DATABASE_URL = process.env.PRODUCTION_DATABASE_URL_TEMPLATE.replace(
      "[YOUR-PASSWORD]",
      encodeURIComponent(process.env.PRODUCTION_DB_PASSWORD),
    );
  }
}
const url = isProd ? process.env.PRODUCTION_DATABASE_URL : process.env.STAGING_DATABASE_URL;
const ref = isProd ? "zekwvsbxksgtofnpapmh" : (process.env.STAGING_PROJECT_REF ?? "hhjjlyizrryjttxtjvcu");
const ledger = isProd ? "public.__migrations" : "public.__staging_migrations";
if (!url) {
  console.error(`${isProd ? "PRODUCTION" : "STAGING"}_DATABASE_URL is not set (or password + template missing).`);
  process.exit(2);
}
if (!url.includes(ref)) {
  console.error(`Refusing: the ${target} connection string does not reference project ${ref}.`);
  process.exit(2);
}

const sql = postgres(url, { ssl: "require", max: 1, prepare: false });
const reset = process.argv.includes("--reset");
if (reset && isProd) {
  console.error("Refusing: --reset is staging-only.");
  process.exit(2);
}

try {
  if (reset) {
    console.log("reset: dropping and recreating schema public (staging)");
    await sql.unsafe("drop schema public cascade; create schema public; grant usage on schema public to anon, authenticated, service_role; grant all on schema public to postgres;");
    await sql.unsafe(
      "alter default privileges in schema public grant all on tables to anon, authenticated, service_role; alter default privileges in schema public grant all on functions to anon, authenticated, service_role; alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;",
    );
  }
  await sql.unsafe(`create table if not exists ${ledger} (name text primary key, applied_at timestamptz not null default now())`);
  // Service-role only, like every other bookkeeping table; keeps the Security Advisor clean.
  await sql.unsafe(`alter table ${ledger} enable row level security; revoke all on ${ledger} from anon, authenticated;`);
  if (isProd) {
    // 0001-0030 were applied by hand (pasted into the SQL editor, 2026-11-02 and before).
    const handApplied = readdirSync(join(root, "supabase", "migrations"))
      .filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) <= 30)
      .sort();
    for (const f of handApplied) await sql.unsafe(`insert into ${ledger} (name, applied_at) values ('${f}', '2026-11-02') on conflict (name) do nothing`);
    console.log("production: taking a data snapshot first (scripts/db-snapshot.mjs)");
    const { execFileSync } = await import("node:child_process");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    execFileSync(process.execPath, [join(root, "scripts", "db-snapshot.mjs"), "dump", "--env", "PRODUCTION_DATABASE_URL", "--out", `backups/prod-${stamp}`], { stdio: "inherit", env: process.env });
  }
  const done = new Set((await sql.unsafe(`select name from ${ledger}`)).map((r) => r.name));
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
        await tx.unsafe(`insert into ${ledger} (name) values ('${f}')`);
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
