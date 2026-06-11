import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon. Larger glyph, rounded square handled by iOS. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#020617",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 140,
            height: 140,
            borderRadius: 999,
            background:
              "linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 48px rgba(124,58,237,0.55)",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 999,
              background: "#020617",
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
