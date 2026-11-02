"use client";

import { useState, useTransition } from "react";
import { Download, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Share the year card. On a phone (and inside the Capacitor shells, which
 * run the same WebView) the Web Share API hands the PNG to the system sheet —
 * Instagram story, WhatsApp, Photos. Where files cannot be shared the card
 * downloads instead, and the link is copied as a last resort.
 */
export function ReviewShare({ year, cardUrl }: { year: number; cardUrl: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function share() {
    setNote(null);
    start(async () => {
      try {
        const res = await fetch(cardUrl, { cache: "no-store" });
        if (!res.ok) throw new Error("Could not render the card.");
        const blob = await res.blob();
        const file = new File([blob], `gigtrotter-${year}.png`, { type: "image/png" });
        const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
        if (nav.share && nav.canShare?.({ files: [file] })) {
          await nav.share({ files: [file], title: `My ${year} in live music` });
          return;
        }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(a.href);
        setNote("Saved the card — share it from your photos.");
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setNote(e instanceof Error ? e.message : "Could not share.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={share} disabled={pending}>
        {pending ? <Download className="animate-pulse" /> : <Share2 />}
        {pending ? "Rendering…" : "Share"}
      </Button>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}
