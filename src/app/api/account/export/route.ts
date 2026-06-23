import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/account/export
 *
 * GDPR data portability — streams everything the signed-in user owns as a
 * downloadable JSON file. RLS scopes every query to the caller, so this only
 * ever returns the requester's own rows.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const tables = [
    "profiles",
    "circles",
    "circle_members",
    "friendships",
    "captures",
    "wallet_items",
    "experiences",
    "trips",
  ] as const;

  const out: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    user_id: user.id,
    email: user.email ?? null,
  };
  for (const t of tables) {
    const { data } = await supabase.from(t).select("*");
    out[t] = data ?? [];
  }

  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="gigtrotter-export.json"',
      "Cache-Control": "no-store",
    },
  });
}
