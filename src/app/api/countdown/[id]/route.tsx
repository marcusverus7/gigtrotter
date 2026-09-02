import { ImageResponse } from "next/og";

import { verifyCountdownToken } from "@/lib/share/countdown-token";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  // This route reads through the service client, so RLS does not apply and the
  // wallet-item id alone must not be enough to see somebody's plans. The owner
  // mints a signed token when they choose to share; without it there is
  // nothing here. Same 404 either way, so the endpoint does not confirm which
  // ids exist.
  const token = new URL(req.url).searchParams.get("t");
  if (!verifyCountdownToken(id, token)) {
    return new Response("Not found", { status: 404 });
  }

  const supabase = createServiceClient();

  const { data: item } = await supabase
    .from("wallet_items")
    .select("title, subtitle, kind, starts_at, venues(name, city, country)")
    .eq("id", id)
    .maybeSingle();

  if (!item || !item.starts_at) {
    return new Response("Not found", { status: 404 });
  }

  const startsAt = new Date(item.starts_at);
  const now = Date.now();
  const diffMs = startsAt.getTime() - now;

  if (diffMs <= 0) {
    return new Response("Event has already started", { status: 410 });
  }

  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const venuesRaw = (item as { venues: unknown }).venues;
  const venue = (Array.isArray(venuesRaw) ? venuesRaw[0] : venuesRaw) as {
    city: string | null;
    country: string | null;
    name: string | null;
  } | null;
  const place = [venue?.name, venue?.city, venue?.country]
    .filter(Boolean)
    .join(" · ");
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(startsAt);

  const kindColors: Record<string, string> = {
    ticket: "#a78bfa",
    flight: "#38bdf8",
    stay: "#34d399",
    restaurant: "#fb923c",
    other: "#a78bfa",
  };
  const accent = kindColors[item.kind] ?? "#a78bfa";

  // The card only changes when the day count does; without this every view of
  // a shared link is a fresh service-role read plus a CPU-bound render.
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

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 16,
            }}
          >
            <div
              style={{
                fontSize: 160,
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: -6,
                color: accent,
              }}
            >
              {days}
            </div>
            <div
              style={{
                fontSize: 40,
                fontWeight: 500,
                color: "#94a3b8",
                lineHeight: 1.2,
              }}
            >
              {days === 1 ? "day" : "days"}
              {"\n"}until
            </div>
          </div>
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: -1,
              marginTop: 8,
            }}
          >
            {item.title}
          </div>
          {place ? (
            <div style={{ marginTop: 8, fontSize: 28, color: "#cbd5e1" }}>
              {place}
            </div>
          ) : null}
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
