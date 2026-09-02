import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { CaptureQuotaError, ingestCapture } from "@/lib/capture/pipeline";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/captures
 *
 * multipart/form-data:
 *   - file: image/jpeg | image/png | image/webp
 *   - source: "screenshot" | "manual" | "extension"   (defaults to "screenshot")
 *
 * Returns { captureId, parsed } so the UI can render the confirm card.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const source =
    (form.get("source") as string | null) === "extension"
      ? "extension"
      : (form.get("source") as string | null) === "manual"
        ? "manual"
        : "screenshot";

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "file too large (8MB max)" }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const { captureId, parsed } = await ingestCapture({
      userId: user.id,
      source,
      bytes,
    });
    return NextResponse.json({ captureId, parsed });
  } catch (err) {
    if (err instanceof CaptureQuotaError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    // The raw message here is verbatim Supabase/Anthropic error text —
    // including things like "credit balance is too low", which tells an
    // attacker the billing state and confirms a cost attack is landing.
    // Log the detail, hand the client a fixed string.
    console.error("[captures] ingest failed:", err);
    return NextResponse.json(
      { error: "Couldn't save that image — try again in a minute." },
      { status: 422 },
    );
  }
}
