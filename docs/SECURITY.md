# Security & data handling

> Tickets + travel history + social graph is a breach with real-world consequences. We design the breach disclosure plan before launch, not after. — §11.4

## Threat model

| Class | Concrete risk | Mitigation |
| --- | --- | --- |
| Empty-house inference | "X will be away during Y" leaks burglary fuel | Time-shift rule: future events RLS-restricted to Inner Circle. Always. |
| Stalking | Real-time location implied by future-event visibility | Same: time-shift rule. |
| Capture honeypot | Identity docs (passport, drivers' licence) end up in DB | Vision parser detects, rejects, deletes the encrypted blob. We are deliberately not a document vault. |
| Ticket fraud | Live barcode/QR leaks via share | Source captures never reach the share sheet. Share cards are SVG rendered from structured fields. Barcodes encrypted at rest, decrypted client-side only, blurred until event ends. |
| Account takeover | Standard | Supabase Auth (Google/Apple/email+pw). Reauth required for irreversible destructive ops in V1. |

## Encryption

- **Source captures**: AES-256-GCM, IV per blob, prepended to ciphertext.
- **Per-user key**: HKDF-derived from `CAPTURE_MASTER_KEY` + `userId` + a fixed salt. Deterministic so we don't need a separate key table in phase 2 — phase 8 introduces a rotated key table without changing call sites.
- **Master key rotation**: `CAPTURE_MASTER_KEY` lives only in deployment secrets. To rotate, decrypt with old → re-encrypt with new in a background job; never store both simultaneously beyond the migration window.

## RLS

Every table has policies. The most load-bearing policy is `experiences:time-shifted-audience-read` — see [SCHEMA.md](SCHEMA.md). RLS is defence-in-depth alongside Server Action checks; the `.select()` silent-fail guard is used on every mutation.

## Data minimisation

The parser is instructed to drop:

- Passport numbers
- Government ID numbers
- Full payment card numbers
- Driver's licence numbers

These never enter `parse_json` and never reach storage as structured fields. The capture itself is rejected and the encrypted blob removed.

## Compliance

- UK/EU data residency: pick `eu-west-2` / `eu-central-1` Supabase region.
- DPA with Supabase: signed before user-facing launch.
- GDPR — exports and erasure live in `src/features/auth/actions.ts` (phase 8 wires the full archive job).
- Google CASA — required for Gmail restricted scopes (V1+). Start paperwork during phase 2.

## Disclosure

PARKED: an incident-response runbook lives at `docs/INCIDENT.md` (to be authored before user-facing launch). The plan:

1. Identify scope (which user_ids, which tables).
2. Notify ICO within 72h if PII was exposed.
3. Notify affected users in plain English.
4. Public post-mortem within 7 days.
