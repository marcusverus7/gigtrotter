"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * The last-resort boundary: a crash in the ROOT layout itself (Providers,
 * the feedback button, font loading) never reaches app/error.tsx, because
 * that one renders as a child of the layout that just failed. Only
 * global-error.tsx replaces the whole document — which is why it, and only
 * it, emits <html> and <body>.
 *
 * Nothing here imports from the app: no Providers, no ui components, no
 * fonts. If those were the thing that broke, importing them would break this
 * too. Inline styles for the same reason.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 1.5rem",
          background: "#020617",
          color: "#e2e8f0",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <AlertTriangle
            style={{ width: 40, height: 40, color: "#f87171", margin: "0 auto" }}
            aria-hidden
          />
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "1rem" }}>
            GigTrotter couldn&apos;t load
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#94a3b8", marginTop: "0.5rem" }}>
            Something went wrong before the app could start. Try again — if it
            keeps happening, tell us the reference below.
          </p>
          {error.digest ? (
            <p
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                fontSize: "0.75rem",
                color: "#64748b",
                marginTop: "0.75rem",
              }}
            >
              ref: {error.digest}
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              minHeight: 44,
              padding: "0 1.25rem",
              borderRadius: "0.5rem",
              border: "1px solid #334155",
              background: "transparent",
              color: "inherit",
              font: "inherit",
              cursor: "pointer",
            }}
          >
            <RefreshCw style={{ width: 16, height: 16 }} aria-hidden />
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
