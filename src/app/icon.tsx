import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/**
 * Browser tab icon — GigTrotter glyph rendered at 64×64. The same shape as
 * the wordmark glyph: violet→cyan map-pin with a dark eye in the middle.
 */
export default function Icon() {
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
            width: 48,
            height: 48,
            borderRadius: 999,
            background:
              "linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 18px rgba(124,58,237,0.6)",
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
      </div>
    ),
    size,
  );
}
