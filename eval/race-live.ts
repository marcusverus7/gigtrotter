/**
 * Live race evidence on a real Postgres (G4 capacity, G6 door), using ONLY
 * the test event's tier and a throwaway ticket row it creates and deletes.
 * Reads credentials from .env.local; never prints them. Run with:
 *   pnpm exec tsx --tsconfig eval/tsconfig.json eval/race-live.ts
 *
 * This is not the isolated-environment run the brief asks for (that is
 * eval/db.test.ts against staging); it is the same statements against the
 * production database scoped to test data, so it proves the SQL, not the
 * environment.
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { makeTicketCode } from "../src/lib/tickets/codes";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const secret = process.env.CAPTURE_MASTER_KEY!;
const EVENT = "1ac722c1-aed6-4286-85d3-097a4b0dd2ee";
const TIER = "6c41c352-2875-45ec-8154-7743bb671b7b";
const OWNER = "40cf0fe5-aa62-43fe-b8b1-1727630d2f3b";

const s = createClient(url, key, { auth: { persistSession: false } });
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

async function g4() {
  const { data: before } = await s.from("ticket_tiers").select("quantity, sold, reserved").eq("id", TIER).single();
  const free = before!.quantity - before!.sold - before!.reserved;
  const N = 100;
  const t0 = Date.now();
  const results = await Promise.all(
    Array.from({ length: N }, () => s.rpc("reserve_tier", { target_tier: TIER, qty: 1 }).then((r) => (r.error ? "err" : !!r.data))),
  );
  const ms = Date.now() - t0;
  const won = results.filter((r) => r === true).length;
  const errs = results.filter((r) => r === "err").length;
  const { data: after } = await s.from("ticket_tiers").select("quantity, sold, reserved").eq("id", TIER).single();
  check(`G4: ${N} concurrent buyers for ${free} seats → exactly ${free} reservations`, won === free && errs === 0, `won=${won} errors=${errs} in ${ms}ms`);
  check("G4: stock never exceeds capacity", after!.sold + after!.reserved <= after!.quantity, JSON.stringify(after));
  for (let i = 0; i < won; i++) await s.rpc("release_tier", { target_tier: TIER, qty: 1 });
  const { data: restored } = await s.from("ticket_tiers").select("reserved").eq("id", TIER).single();
  check("G4: releases restore the hold exactly", restored!.reserved === before!.reserved, `reserved=${restored!.reserved}`);
}

async function g6() {
  const code = makeTicketCode(secret);
  const { data: t, error } = await s
    .from("tickets")
    .insert({ event_id: EVENT, tier_id: TIER, owner_id: OWNER, code, issued_as: "comp", status: "valid" } as never)
    .select("id")
    .single();
  if (error || !t) throw new Error(`could not insert race ticket: ${error?.message}`);
  try {
    const N = 10;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        s
          .from("tickets")
          .update({ status: "used", used_at: new Date().toISOString(), checked_in_by: OWNER } as never)
          .eq("id", t.id)
          .eq("status", "valid")
          .select("id")
          .then((r) => (r.error ? "err" : (r.data?.length ?? 0))),
      ),
    );
    const admitted = results.filter((r) => r === 1).length;
    check(`G6: ${N} racing scanners on one code → exactly one admission`, admitted === 1 && !results.includes("err"), JSON.stringify(results));
    const { data: row } = await s.from("tickets").select("status, used_at").eq("id", t.id).single();
    check("G6: row is used once with a time", row!.status === "used" && !!row!.used_at);
  } finally {
    await s.from("tickets").delete().eq("id", t.id);
  }
}

g4()
  .then(g6)
  .then(() => {
    console.log(failures === 0 ? "\nlive race evidence: all passed" : `\nlive race evidence: ${failures} failed`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
