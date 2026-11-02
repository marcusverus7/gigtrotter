"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * The admission QR. Encodes the signed ticket code; the door scanner reads
 * it back and the server checks the signature before touching the database.
 * Rendered client-side so the code never sits in a server-rendered image URL.
 */
export function TicketQr({ code, size = 220 }: { code: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(code, { errorCorrectionLevel: "M", margin: 1, width: size, color: { dark: "#0f172a", light: "#ffffff" } })
      .then((d) => live && setSrc(d))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [code, size]);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-xl bg-white p-3" style={{ width: size + 24, height: size + 24 }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} width={size} height={size} alt="Ticket QR code" className="block" />
        ) : (
          <div style={{ width: size, height: size }} className="animate-pulse rounded bg-slate-200" />
        )}
      </div>
      <p className="font-mono text-sm tracking-wider text-foreground">{code}</p>
    </div>
  );
}
