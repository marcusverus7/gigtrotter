import { ImageResponse } from "next/og";

import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Redaction-safe share-card renderer (§3.3).
 *
 * Renders a 1200×630 OG image from STRUCTURED DATA ONLY — title, venue,
 * city, date, kind. The source capture screenshot is never used, so QR
 * codes, booking refs, names and seat numbers physically cannot leak.
 *
 * Visibility: respects the experiences time-shift policy. The service-role
 * client wouldn't normally honour RLS, so we apply the same predicate
 * manually: only experiences with audience='open' AND ends_at < now() are
 * shareable. Other tiers 404.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = createServiceClient();
  const { data: exp } = await supabase
    .from("experiences")
    .select("kind, title, subtitle, starts_at, audience, ends_at, venues(city, country, name)")
    .eq("id", id)
    .maybeSingle();

  const now = Date.now();
  if (
    !exp ||
    exp.audience !== "open" ||
    new Date(exp.ends_at).getTime() >= now
  ) {
    return new Response("Not found", { status: 404 });
  }

  const venuesRaw = (exp as { venues: unknown }).venues;
  const venue = (Array.isArray(venuesRaw) ? venuesRaw[0] : venuesRaw) as {
    city: string | null;
    country: string | null;
    name: string | null;
  } | null;
  const place = [venue?.name, venue?.city, venue?.country].filter(Boolean).join(" · ");
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(exp.starts_at));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 60,
          color: "white",
          background:
            "radial-gradient(60% 50% at 20% 0%, rgba(124,58,237,0.25), transparent 70%), radial-gradient(50% 40% at 90% 10%, rgba(6,182,212,0.2), transparent 70%), #020617",
          fontFamily: "Inter, system-ui",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background:
                "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)",
            }}
          />
          <div style={{ fontSize: 24, fontWeight: 600 }}>GigTrotter</div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ textTransform: "uppercase", letterSpacing: 4, fontSize: 18, color: "#a78bfa" }}>
            {exp.kind}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 84,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1,
            }}
          >
            {exp.title}
          </div>
          <div style={{ marginTop: 16, fontSize: 30, color: "#cbd5e1" }}>
            {place}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            paddingTop: 24,
            color: "#cbd5e1",
            fontSize: 22,
            fontFamily: "monospace",
          }}
        >
          <span>{dateLabel}</span>
          <span>gigtrotter · the wallet that remembers</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
