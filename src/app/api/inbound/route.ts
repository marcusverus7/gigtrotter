import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { serverEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";
import { ingestCapture } from "@/lib/capture/pipeline";

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

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret");
  if (!secret || secret !== serverEnv.inboundWebhookSecret) {
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
    return NextResponse.json({ error: "unknown_recipient" }, { status: 404 });
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
    return NextResponse.json(
      { error: "no_parseable_content" },
      { status: 422 },
    );
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "ingest_failed" },
      { status: 422 },
    );
  }
}
