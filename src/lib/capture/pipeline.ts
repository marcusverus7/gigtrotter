import "server-only";

import {
  createClient,
  createServiceClient,
} from "@/lib/supabase/server";
import {
  encryptBytes,
  templateHash,
} from "@/lib/capture/encryption";
import { ParseError, parseCaptureBytes } from "@/lib/capture/parser";
import {
  KNOWN_VENDORS,
  ParsedCaptureSchema,
  type ParsedCapture,
} from "@/lib/capture/schema";

const STORAGE_BUCKET = "captures";

/**
 * Per-user daily ceiling on captures. Every capture is real money — a vision
 * call plus an encrypted storage write — signup is open, and the Anthropic
 * account has run dry once already. The fingerprint cache only suppresses
 * byte-identical re-uploads, so without a count-based ceiling a script
 * flipping one pixel per request has an open-ended tap on the bill.
 *
 * Enforced HERE, not in the routes, because both /api/captures and the
 * inbound-email webhook funnel through this function — one quota covers every
 * way bytes can arrive, including ones added later. 100/day is far above any
 * honest use (a big backfill session) while capping the worst day at pennies.
 */
const DAILY_CAPTURE_LIMIT = 100;

export class CaptureQuotaError extends Error {
  constructor() {
    super("Daily capture limit reached — try again tomorrow.");
    this.name = "CaptureQuotaError";
  }
}

/**
 * Inserts a capture row, stores the encrypted source, parses it (Claude
 * vision or fingerprint cache), and returns the capture id. Status flips
 * to 'confirmed' only after the user accepts the confirm card in the UI.
 *
 * Used by:
 *   - POST /api/captures   (user-initiated upload from the share sheet / picker)
 *   - POST /api/inbound    (forwarded email; runs via service-role client)
 *
 * The `client` arg lets callers pass a service-role client when running
 * outside an authenticated request (the inbound webhook).
 */
export async function ingestCapture(opts: {
  userId: string;
  source: "screenshot" | "email" | "extension" | "manual";
  bytes: Uint8Array;
  filename?: string;
  serviceRole?: boolean;
}): Promise<{ captureId: string; parsed: ParsedCapture }> {
  const supabase = opts.serviceRole
    ? createServiceClient()
    : await createClient();

  // vendor_fingerprints has a SELECT policy and no client write policy at all
  // (migrations 0002 and 0012 both say so), so writing to it with the session
  // client is denied without raising anything the caller can see. Reads stay
  // on `supabase` so RLS still scopes them; only the writes need the elevated
  // client. Without this the cache was never populated on the upload path and
  // every re-upload of a byte-identical image paid for a fresh vision call.
  const fingerprintWriter = createServiceClient();

  // 0) Quota, before a single byte is stored or sent anywhere. Counting rows
  //    is one indexed query and needs no new infrastructure; the row is
  //    written before the vision call, so even a request that later fails
  //    still counts against the day.
  const { count: recentCount } = await supabase
    .from("captures")
    .select("id", { count: "exact", head: true })
    .eq("user_id", opts.userId)
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  if ((recentCount ?? 0) >= DAILY_CAPTURE_LIMIT) {
    throw new CaptureQuotaError();
  }

  // 1) Fingerprint first, then store. The hash used to be computed AFTER the
  //    upload, so a cache-hit duplicate skipped the vision call but still
  //    wrote a fresh blob under a new UUID every time. Deriving the storage
  //    key from the content hash makes duplicate storage structurally
  //    impossible: the same bytes land on the same key, and a second upload
  //    is refused by the store and treated as already-done.
  const hash = await templateHash(opts.bytes);

  const encrypted = await encryptBytes(opts.userId, opts.bytes);
  const key = `${opts.userId}/${hash}.enc`;
  const { error: upErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(key, encrypted, {
      contentType: "application/octet-stream",
      upsert: false,
    });
  // "Duplicate" means this exact artefact is already stored for this user —
  // the key is content-addressed, so reusing it is correct, not a collision.
  if (upErr && !/already exists|duplicate/i.test(upErr.message)) {
    throw new Error(`Upload failed: ${upErr.message}`);
  }

  // 2) Fingerprint cache lookup (skip the LLM if we've parsed this exact
  //    artefact for this user before). Scoped per user: field_map holds the
  //    extracted VALUES (title, venue, details like "seat 12A"), so a global
  //    cache would replay one user's capture into another's — see migration
  //    0012. templateHash is a SHA-256 of the bytes, so this only ever hits on
  //    a genuinely identical re-upload.
  const { data: cached } = await supabase
    .from("vendor_fingerprints")
    .select("vendor, field_map, hit_count")
    .eq("template_hash", hash)
    .eq("user_id", opts.userId)
    .maybeSingle();

  let parsed: ParsedCapture;
  let cacheHit = false;
  let parseError: string | null = null;
  let confidence = 0;

  // Re-validate the cached blob rather than casting it. Stored JSON is just
  // another untrusted input — it may predate a schema change — and skipping
  // validation here would bypass the same guarantee parseCaptureBytes enforces.
  const cachedParse = cached
    ? ParsedCaptureSchema.safeParse(cached.field_map)
    : null;

  if (cachedParse?.success) {
    parsed = cachedParse.data;
    cacheHit = true;
    confidence = parsed.confidence ?? 0.95;
  } else {
    try {
      parsed = await parseCaptureBytes(opts.bytes);
      confidence = parsed.confidence;

      // Cache the template for next time. Use the vendor the parser claimed,
      // falling back to "unknown" so we still benefit from exact-image hits.
      const vendor = (parsed.vendor ?? "unknown").toLowerCase();
      const { error: cacheErr } = await fingerprintWriter
        .from("vendor_fingerprints")
        .insert({
          vendor,
          user_id: opts.userId,
          template_hash: hash,
          field_map: parsed as never,
        });
      // A cache miss must never fail the capture, but it should not be
      // invisible either -- that is how this went unnoticed.
      if (cacheErr) {
        console.error("[capture] fingerprint cache write failed", cacheErr);
      }
    } catch (err) {
      const reason = err instanceof ParseError ? err.reason : "model_error";
      parseError = `${reason}: ${err instanceof Error ? err.message : "unknown"}`;
      // Surface a placeholder parse so the row still lands — the UI shows a
      // manual-review state instead of swallowing the capture silently.
      parsed = {
        kind: "other",
        title: "Couldn't read this one",
        starts_at: null,
        ends_at: null,
        vendor: null,
        price_total_cents: null,
        currency: null,
        barcode_present: false,
        confidence: 0,
        details: [],
        pii_detected: false,
      };
    }
  }

  // 3) PII scrub. If the parser detected an identity doc, drop the parse and
  //    reject the capture per §11.4 (the honeypot problem).
  if (parsed.pii_detected) {
    await supabase
      .from("captures")
      .insert({
        user_id: opts.userId,
        source: opts.source,
        storage_ref: null, // delete the encrypted blob too
        status: "rejected",
        error: "PII detected — capture rejected. GigTrotter is not a document vault.",
      });
    await supabase.storage.from(STORAGE_BUCKET).remove([key]);
    throw new Error(
      "This looks like an identity document. GigTrotter doesn't store those.",
    );
  }

  // 4) Persist the capture row.
  const inferredVendor =
    parsed.vendor ??
    Object.keys(KNOWN_VENDORS).find((v) =>
      parsed.title.toLowerCase().includes(v),
    ) ??
    null;

  const { data: row, error: insErr } = await supabase
    .from("captures")
    .insert({
      user_id: opts.userId,
      source: opts.source,
      storage_ref: key,
      parse_json: parsed as never,
      confidence,
      vendor: inferredVendor,
      // Still 'pending', not 'rejected'. The placeholder parse above exists so
      // the user gets a manual-review card; PendingCaptures only fetches
      // 'pending', so writing 'rejected' here meant an unreadable upload
      // vanished with no error and no card -- the exact silent swallow the
      // placeholder was added to prevent. 'rejected' belongs to the user
      // dismissing a capture, which rejectCapture() sets.
      status: "pending",
      error: parseError,
    })
    .select("id")
    .single();

  if (insErr || !row) {
    throw new Error(`Insert failed: ${insErr?.message ?? "no row"}`);
  }

  if (cacheHit) {
    // Was `(cached ? 1 : 0) + 1`, which pinned every row at 2 forever — the
    // count never reflected real reuse. Increment the stored value instead.
    await fingerprintWriter
      .from("vendor_fingerprints")
      .update({
        hit_count: (cached?.hit_count ?? 0) + 1,
        last_seen_at: new Date().toISOString(),
      })
      .eq("template_hash", hash)
      .eq("user_id", opts.userId);
  }

  return { captureId: row.id, parsed };
}
