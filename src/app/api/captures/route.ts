import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { ingestCapture } from "@/lib/capture/pipeline";

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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "ingest_failed" },
      { status: 422 },
    );
  }
}
