import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";

import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";

/**
 * TEMPORARY diagnostic — delete once the Anthropic key is confirmed working.
 *
 * Production was returning `401 invalid x-api-key` on every capture while the
 * identical key in `.env.local` worked, so we need to know whether the value
 * deployed to Vercel is the same string. This reports a FINGERPRINT of it —
 * length, first/last few characters, whitespace flags and a SHA-256 — so the
 * two can be compared without the secret ever leaving the server.
 *
 * Gated on the inbound webhook secret so it isn't publicly readable.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret");
  if (!secret || secret !== serverEnv.inboundWebhookSecret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const raw = process.env.ANTHROPIC_API_KEY ?? "";
  if (!raw) {
    return NextResponse.json({ present: false });
  }

  return NextResponse.json({
    present: true,
    rawLength: raw.length,
    trimmedLength: raw.trim().length,
    hasLeadingSpace: raw !== raw.trimStart(),
    hasTrailingSpace: raw !== raw.trimEnd(),
    startsWith: raw.trim().slice(0, 11),
    endsWith: raw.trim().slice(-6),
    // Hash of the TRIMMED value, so a whitespace-only difference still matches.
    sha256: createHash("sha256").update(raw.trim()).digest("hex").slice(0, 16),
    model: serverEnv.anthropicParseModel,
  });
}
