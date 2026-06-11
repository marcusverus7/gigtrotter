import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "GigTrotter — the wallet that remembers. A capture-first ticket & travel wallet.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Sitewide Open Graph image. Used when the landing page is linked anywhere
 * (iMessage, Slack, Twitter, etc.). Same look as /share/[id]/route.tsx but
 * with marketing copy in place of a specific pin.
 */
export default function OpenGraphImage() {
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
          background:
            "radial-gradient(60% 50% at 20% 0%, rgba(124,58,237,0.3), transparent 70%), radial-gradient(50% 40% at 90% 10%, rgba(6,182,212,0.22), transparent 70%), #020617",
          fontFamily: "Inter, system-ui",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 999,
              background:
                "linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%)",
              boxShadow: "0 0 24px rgba(124,58,237,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 999,
                background: "#020617",
              }}
            />
          </div>
          <div style={{ fontSize: 28, fontWeight: 600 }}>GigTrotter</div>
        </div>

        {/* Headline */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 92,
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: -1.5,
              display: "flex",
              gap: 22,
              flexWrap: "wrap",
            }}
          >
            <span>Where your</span>
            <span
              style={{
                backgroundImage:
                  "linear-gradient(120deg, #a78bfa 0%, #f0abfc 40%, #67e8f9 100%)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              journey
            </span>
            <span>lives.</span>
          </div>
          <div
            style={{
              marginTop: 18,
              fontSize: 22,
              fontFamily: "monospace",
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "#a78bfa",
            }}
          >
            The wallet that remembers
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 26,
              color: "#cbd5e1",
              maxWidth: 800,
            }}
          >
            Your tickets, flights and bookings — and the private map of your
            life that fills itself.
          </div>
        </div>

        {/* Footer chips */}
        <div
          style={{
            display: "flex",
            gap: 16,
            color: "#94a3b8",
            fontSize: 20,
            fontFamily: "monospace",
          }}
        >
          <span>· capture-first</span>
          <span>· privacy-native</span>
          <span>· map-as-identity</span>
        </div>
      </div>
    ),
    size,
  );
}
