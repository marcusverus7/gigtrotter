import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { serverEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";
import { CaptureQuotaError, ingestCapture } from "@/lib/capture/pipeline";

export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * Inbound email webhook for the forwarding-address route (route #2 in the
 * capture layer). Each user gets a personal forwarding address shaped like
 * `<anon_handle>@<FORWARDING_DOMAIN>`; the email provider (Resend/Postmark)
 * posts the parsed email here.
 *
 * Auth: shared secret in `x-webhook-secret`. The webhook IS the trust boundary
 * here — we run under the service-role client and write on the user's behalf.
 */

const InboundSchema = z.object({
  // The address the email was sent to. The local-part matches an anon_handle.
  to: z.union([z.string(), z.array(z.string())]),
  from: z.string().optional(),
  subject: z.string().optional(),
  attachments: z
    .array(
      z.object({
        // Resend uses `content` (base64); Postmark uses `Content`. Accept both.
        content: z.string().optional(),
        Content: z.string().optional(),
        contentType: z.string().optional(),
        ContentType: z.string().optional(),
        name: z.string().optional(),
        Name: z.string().optional(),
      }),
    )
    .default([]),
  // When there are no image attachments, try the HTML body as a screenshot
  // proxy (some providers render the email and attach a screenshot upstream).
  html: z.string().optional(),
});

function extractLocalPart(to: string | string[]): string | null {
  const first = Array.isArray(to) ? to[0] : to;
  if (!first) return null;
  const m = first.match(/^([a-z0-9-]+)@/i);
  return m?.[1]?.toLowerCase() ?? null;
}

/**
 * Permanent-failure response. Deliberately identical for "no such handle",
 * "sender not recognised" and "nothing parseable": a 404 for unknown handles
 * was an oracle that confirmed which anon handles exist to anyone holding the
 * shared secret, and non-2xx statuses make email providers retry what will
 * never succeed. The reason is logged server-side instead.
 */
function skipped(reason: string) {
  console.warn(`[inbound] skipped: ${reason}`);
  return NextResponse.json({ ok: false });
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret");
  // Constant-time compare — a variable-time !== leaks the secret byte by byte
  // to anyone who can measure response times. Same pattern as countdown-token.
  const expected = Buffer.from(serverEnv.inboundWebhookSecret);
  const given = Buffer.from(secret ?? "");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const json = await request.json();
  const parsed = InboundSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }
  const body = parsed.data;

  const handle = extractLocalPart(body.to);
  if (!handle) {
    return NextResponse.json({ error: "no_handle" }, { status: 400 });
  }

  // Find the user by anon_handle. The forwarding address uses anon_handle so
  // a user can give it out without exposing their username.
  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("anon_handle", handle)
    .maybeSingle();

  if (!profile) {
    return skipped(`unknown handle ${handle}`);
  }

  // The shared secret authenticates the EMAIL PROVIDER, not the email SENDER.
  // Without this check, anyone who learns a forwarding handle can email
  // unlimited images to it — each one a vision call and a service-role
  // storage write charged to us. Require the sender to be the account's own
  // email address; if a real tester needs to forward from a second address,
  // that becomes a per-user allowlist, not an open door.
  const { data: authUser } = await supabase.auth.admin.getUserById(profile.id);
  const accountEmail = authUser?.user?.email?.toLowerCase();
  const senderEmail = body.from?.match(/<([^>]+)>/)?.[1] ?? body.from;
  if (!accountEmail || senderEmail?.trim().toLowerCase() !== accountEmail) {
    return skipped(`sender ${senderEmail ?? "(none)"} does not match account for ${handle}`);
  }

  // Pick the first image attachment that looks like a ticket/itinerary.
  const att = body.attachments.find((a) => {
    const ct = (a.contentType ?? a.ContentType ?? "").toLowerCase();
    return ct.startsWith("image/") || ct === "application/pdf";
  });

  let bytes: Uint8Array | null = null;
  if (att) {
    const content = att.content ?? att.Content;
    if (content) bytes = new Uint8Array(Buffer.from(content, "base64"));
  }

  if (!bytes) {
    return skipped("no parseable attachment");
  }
  // Mirror the 8MB cap the upload route enforces — this path must not be the
  // way around it.
  if (bytes.byteLength > 8 * 1024 * 1024) {
    return skipped("attachment over 8MB");
  }

  try {
    const result = await ingestCapture({
      userId: profile.id,
      source: "email",
      bytes,
      serviceRole: true,
    });
    return NextResponse.json({ ok: true, captureId: result.captureId });
  } catch (err) {
    if (err instanceof CaptureQuotaError) {
      // Permanent for today — do not invite provider retries.
      return skipped(`quota reached for ${handle}`);
    }
    // Fixed string out, detail in the logs — raw provider/DB error text has
    // no business in a response body.
    console.error("[inbound] ingest failed:", err);
    return NextResponse.json({ error: "ingest_failed" }, { status: 422 });
  }
}
