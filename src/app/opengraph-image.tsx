import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "GigTrotter — discover gigs, build your map. The gig never ends.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 999,
              background:
                "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)",
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
            <span>The gig</span>
            <span
              style={{
                backgroundImage:
                  "linear-gradient(120deg, #a78bfa 0%, #f0abfc 40%, #67e8f9 100%)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              never
            </span>
            <span>ends.</span>
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
            Discover · Attend · Share · Remember
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 26,
              color: "#cbd5e1",
              maxWidth: 800,
            }}
          >
            Find gigs, grab tickets, join the discussion, and build a map of
            every live experience you&apos;ve ever had.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 16,
            color: "#94a3b8",
            fontSize: 20,
            fontFamily: "monospace",
          }}
        >
          <span>· gig discovery</span>
          <span>· ticket wallet</span>
          <span>· your life map</span>
        </div>
      </div>
    ),
    size,
  );
}
