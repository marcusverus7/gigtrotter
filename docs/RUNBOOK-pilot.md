# Pilot runbook: release, rollback, recovery

Covers the 2026-11-02 pilot-hardening change set (migrations 0031 + 0032).
Everything here is written against the environment as it is today: Vercel
Hobby, Supabase project `zekwvsbxksgtofnpapmh` (production), Stripe not yet
configured, GitHub Actions for best-effort schedules.

## 1. Release order

Code on `main` auto-deploys. Both migrations are additive and the code
tolerates their absence (fallbacks are listed below), so the order is:

1. **Apply `supabase/pending/APPLY-ME-0031.sql`** in the production SQL
   editor (owner action). Then `APPLY-ME-0032.sql`, `APPLY-ME-0033.sql`, `APPLY-ME-0034.sql`.
2. Verify (SQL editor, as the project owner):
   ```sql
   select relname, reloptions from pg_class where relname = 'achievements';            -- {security_invoker=true}
   select grantee from information_schema.role_table_grants where table_name = 'admin_provider_clicks';  -- no anon/authenticated
   select proname from pg_proc where proname in ('fulfil_order_tx','fulfil_resale_tx','request_order_refund_tx','can_check_in','reserve_capture_slot');
   select policyname from pg_policies where tablename = 'event_interests';          -- "owner, inner circle, friends after"
   ```
   And from outside, with the anon key (should all be 401/403 now):
   `GET /rest/v1/achievements`, `GET /rest/v1/admin_provider_clicks`,
   `POST /rest/v1/rpc/trip_assemble {"target_user":"00000000-0000-0000-0000-000000000000"}` → `forbidden`.
3. Push / merge the code (already on `main` with this change set).
4. Set the new environment variables in Vercel (Production + Preview, Sensitive):
   - `TICKET_SIGNING_KEY` — **done 2026-11-03** (set on Production + Preview as Sensitive via the Vercel CLI, generated locally, never displayed; production redeployed as `gigtrotter-f6tkkam50`). New ticket codes sign with it; old codes keep verifying through `CAPTURE_MASTER_KEY`.
   - `SUPPORT_EMAIL` — once a real mailbox exists; the public pages show a placeholder until then.
   - `CAPTURE_PLATFORM_DAILY_LIMIT` — optional, default 2000.
   - (Stripe, when the account exists) `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
   Saving does nothing until a redeploy.
5. Add the `CRON_SECRET` repo secret in GitHub if it is not already there (same value as Vercel's), so the `orders-reconcile` workflow can call the endpoint every 15 minutes.

### What runs before the migrations are applied

| Surface | Without 0031 | Without 0032 |
|---|---|---|
| Checkout / webhook | fulfilment throws (Stripe retries); only matters once Stripe keys exist | n/a |
| Order page | loads; nudge logs an error and does nothing | n/a |
| Door scanner | promoter only (`can_check_in` absent → fallback) | n/a |
| Sales page door-staff section | empty list; adding says "needs migration 0031" | n/a |
| Admin orders page | empty sections | n/a |
| Capture | unchanged | count-based quota (logs once) |
| Profiles (0033) | anonymous boards remain linkable to usernames via the anon key | n/a |
| Views / RPC guards | still leaky (SEC-01/02/03 open) | n/a |

## 2. Rollback

- **Code**: revert the merge commit on `main`; Vercel redeploys the previous build. Nothing in 0031 is required by the previous code, so the schema can stay.
- **Schema**: 0031 adds columns, tables, functions and policies, and tightens grants. If a tightened grant breaks something unexpected, the narrow reversals are:
  ```sql
  -- re-open achievements to signed-in users without invoker semantics (NOT recommended)
  alter view public.achievements set (security_invoker = false);
  -- restore the pre-0031 friends-read on event_interests
  drop policy "event_interests: owner, inner circle, friends after" on public.event_interests;
  create policy "event_interests: own and friends read" on public.event_interests
    for select using (auth.uid() = user_id or public.are_friends(user_id, auth.uid()));
  ```
  Do not drop `refunds`, `stripe_events` or the `fulfilled_at` columns once an order has been fulfilled by the new path; they are the audit trail.
- **Keys**: unsetting `TICKET_SIGNING_KEY` makes new codes sign with the legacy key again; codes already issued under v2 would then fail to verify, so only unset it before any v2 ticket exists, or keep it.

## 3. Backups and restore

Supabase Free has no point-in-time recovery and the dashboard shows "No backups" for this project, and `pg_dump` is not installed on the owner's machine. Interim plan, data only (the schema is the migrations):

```bash
node scripts/db-snapshot.mjs dump --env PRODUCTION_DATABASE_URL --out backups/$(date +%F)
```

Put the production connection string in `.env.local` as `PRODUCTION_DATABASE_URL` (gitignored; `backups/` is gitignored too). Take one before applying 0031/0032. Restore into a project that already has the migrations applied:

```bash
node scripts/db-snapshot.mjs restore --env STAGING_DATABASE_URL --in backups/2026-11-02
```

Restoring into production needs `--i-mean-production`. Auth users are not in `public`, so a full restore after a lost project also needs the users re-created (Supabase Auth export is a dashboard/API action). Rehearsed on staging 2026-11-03: dump of 50 tables and a restore back in, exit 0 (the truncate-cascade NOTICE lines are expected). Proper backups mean the Pro plan (daily backups + PITR add-on); that decision is in docs/OWNER_FACTS_NEEDED.md.

## 4. Payment reconciliation: who acts and how

Signals, in order of noise:
1. The `orders-reconcile` GitHub workflow goes red (endpoint answered 500) → something needs a human.
2. `/app/admin/orders` lists every exception with its next action.
3. A buyer writes in: find their order id on `/app/admin/orders` or by email in the orders table (service role).

| State on the admin page | Meaning | Action |
|---|---|---|
| Paid but not fulfilled | Stripe has the money, buyer has no tickets | **Retry fulfilment**. If it keeps failing, read `fulfilment_error` (data problem: e.g. event deleted), fix, retry. Never refund first. |
| Pending past window | Checkout started, never confirmed | Usually clears itself; the note says why one did not. `error:` notes mean Stripe could not be reached; wait a run. |
| Refunds in flight | Requested or pending at Stripe | Wait. Three or more attempts means Stripe keeps timing out; check Stripe status page. |
| Refunds failed | Stripe refused | Read the error. Common: insufficient platform balance (top up in Stripe), charge already refunded manually (mark as handled by inserting an ops_actions note; the row stays failed as the record). Then **Retry refund**. |
| Webhook events not finished | Handler threw repeatedly | After the fix, **Reconcile now** replays them. |
| Ticket count mismatch | Should not happen | Retry fulfilment (adds only missing units), then report it. |

Whole-order refund (event cancelled): admin page → Refund whole order with a reason. Voids every valid ticket, requests the refund; the order says `refunded` only when Stripe confirms. Fees: the buyer fee is refunded with the face in the current implementation (`refund_application_fee: false` means Stripe keeps the application fee on the platform; the amount refunded is the full order total so the platform bears the fee). **Business decision pending**: whether the fee is kept on promoter-initiated cancellations. See docs/OWNER_FACTS_NEEDED.md.

## 5. Door night

- Staff: the promoter names door operators on the sales page; they open `/app/events/<id>/scan` on any phone that can sign in. They see tickets only, no sales.
- Scanner states: green IN; red for used / wrong event / not found / cancelled / not allowed; amber "couldn't reach the server, retry" for any connection problem. Amber is never a verdict.
- Lost connection on the door: keep the typed code; retry when back. The server records the first scan; a retry of your own scan within two minutes says "already in (your scan)". If the venue has no signal at all, the authorised fallback is the promoter's guest list export from the sales page (names + tier, no codes) and manual tick-off; reconcile by marking tickets used afterwards. There is no offline multi-scanner mode and the app does not claim one.
- Escalation: the promoter has the owner's number; the owner has `/app/admin/orders`.

## 6. Key rotation

- Ticket signing: set `TICKET_SIGNING_KEY`, redeploy. New codes are v2; old verify through the keyring. Keep `CAPTURE_MASTER_KEY` until every v1 ticket's event has passed.
- Capture encryption: set `CAPTURE_MASTER_KEY_V2`, redeploy; new captures record `key_version = 2`. Old blobs stay v1 and decrypt with the old key. Never delete `CAPTURE_MASTER_KEY` while any `captures.key_version = 1` rows exist.
- Never paste key values into chat, tickets or logs. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

## 7. Post-release checks

- `/app/admin/orders` loads and says Clean.
- `curl -H "Authorization: Bearer $CRON_SECRET" https://gigtrotter.vercel.app/api/cron/orders-reconcile` → 200 with `"ok":true`.
- Anonymous `GET /rest/v1/achievements` → 401/403.
- Sales page shows the Door staff section; adding a test user works; the scanner opens for them; removing them locks them out.
- Night mode for an imported ticket shows the issuer instructions and no barcode-looking block.
