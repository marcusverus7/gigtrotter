import { ImageResponse } from "next/og";

import { verifyReviewToken } from "@/lib/share/review-token";
import { computeYearStats, REVIEW_SELECT, toReviewRows } from "@/lib/review/year-stats";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The Wrapped card: a 1080×1920 story-sized PNG of one year on the map.
 *
 * Reads through the service client so the link works for people without the
 * app, and is therefore gated on a token only the owner's page can mint —
 * the same shape as the countdown card. Nothing on it that the owner did
 * not already see on their own review page; no venue addresses, no dates
 * finer than a month, no friends.
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ year: string }> },
) {
  const { year } = await context.params;
  const y = parseInt(year, 10);
  const url = new URL(req.url);
  const userId = url.searchParams.get("u");
  const token = url.searchParams.get("t");
  if (!Number.isFinite(y) || !userId || !verifyReviewToken(userId, y, token)) {
    return new Response("Not found", { status: 404 });
  }

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("id", userId)
    .maybeSingle();
  const { data: experiences } = await supabase
    .from("experiences")
    .select(REVIEW_SELECT)
    .eq("user_id", userId)
    .gte("starts_at", `${y}-01-01T00:00:00.000Z`)
    .lt("starts_at", `${y + 1}-01-01T00:00:00.000Z`);

  const stats = computeYearStats(y, toReviewRows(experiences as Array<Record<string, unknown>> | null));
  if (stats.gigs + stats.flights + stats.stays === 0) {
    return new Response("Not found", { status: 404 });
  }
  const name = profile?.display_name?.split(" ")[0] ?? profile?.username ?? "My";

  const big = (n: number | string, label: string, accent = "#a78bfa") => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", fontSize: 120, fontWeight: 800, lineHeight: 1, letterSpacing: -4, color: accent }}>{n}</div>
      <div style={{ display: "flex", fontSize: 34, color: "#94a3b8" }}>{label}</div>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 80,
          color: "white",
          // Satori (next/og) rejects a `background` shorthand that mixes
          // gradients with a flat colour; keep them on separate properties.
          backgroundColor: "#020617",
          backgroundImage:
            "radial-gradient(circle at 15% 0%, rgba(124,58,237,0.35), transparent 60%), radial-gradient(circle at 95% 15%, rgba(6,182,212,0.25), transparent 55%), radial-gradient(circle at 50% 100%, rgba(236,72,153,0.2), transparent 55%)",
          fontFamily: "Inter, system-ui",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", width: 44, height: 44, borderRadius: 999, background: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)" }} />
          <div style={{ display: "flex", fontSize: 32, fontWeight: 600 }}>GigTrotter</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 60, gap: 8 }}>
          <div style={{ display: "flex", fontSize: 40, color: "#94a3b8" }}>{`${name === "My" ? "My" : `${name}'s`} year in live music`}</div>
          <div style={{ display: "flex", fontSize: 180, fontWeight: 900, lineHeight: 1, letterSpacing: -8 }}>{y}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 56, marginTop: 90, flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {big(stats.gigs, stats.gigs === 1 ? "gig" : "gigs")}
            {big(stats.cities.length, stats.cities.length === 1 ? "city" : "cities", "#38bdf8")}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {big(stats.liveHours, "hours of live music", "#f472b6")}
            {stats.km > 0 ? big(stats.km.toLocaleString("en-GB"), "km travelled", "#34d399") : big(stats.countries.length, stats.countries.length === 1 ? "country" : "countries", "#34d399")}
          </div>
          {stats.topArtist ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 20 }}>
              <div style={{ display: "flex", fontSize: 30, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 4 }}>Most seen</div>
              <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>{stats.topArtist}</div>
              {stats.topArtistCount > 1 ? <div style={{ display: "flex", fontSize: 32, color: "#94a3b8" }}>{`${stats.topArtistCount} times`}</div> : null}
            </div>
          ) : null}
          {stats.topVenue ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", fontSize: 30, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 4 }}>Home venue</div>
              <div style={{ display: "flex", fontSize: 52, fontWeight: 600, lineHeight: 1.1 }}>{stats.topVenue}</div>
            </div>
          ) : null}
          {stats.busiestMonth != null ? (
            <div style={{ display: "flex", fontSize: 34, color: "#94a3b8" }}>{`Busiest month: ${MONTHS[stats.busiestMonth]}`}</div>
          ) : null}
        </div>

        <div style={{ display: "flex", fontSize: 30, color: "#64748b" }}>gigtrotter.vercel.app — every gig becomes a pin</div>
      </div>
    ),
    {
      width: 1080,
      height: 1920,
      headers: { "Cache-Control": "private, max-age=3600" },
    },
  );
}
