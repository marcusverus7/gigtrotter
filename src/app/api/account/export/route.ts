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
  // Scoped to the caller explicitly. `select *` relied on RLS to narrow each
  // table, but profiles is read-all and experiences shows friends' pins — so a
  // "my data" download carried every account's profile (anon handles
  // included) and other people's gigs.
  const { data: myCircles } = await supabase.from("circles").select("id").eq("user_id", user.id);
  const circleIds = (myCircles ?? []).map((c) => c.id);
  for (const t of tables) {
    let q = supabase.from(t).select("*");
    if (t === "profiles") q = q.eq("id", user.id);
    else if (t === "circle_members") q = circleIds.length ? q.in("circle_id", circleIds) : q.eq("circle_id", "00000000-0000-0000-0000-000000000000");
    else if (t === "friendships") q = q.or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
    else q = q.eq("user_id", user.id);
    const { data } = await q;
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
