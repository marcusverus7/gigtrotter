"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Share or copy the public board link — the one thing the Public Board page did not have. */
export function BoardShare({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }) : null;
  return (
    <div className="flex flex-wrap gap-2">
      {nav?.share ? (
        <Button
          size="sm"
          onClick={() => nav.share!({ url, title }).catch(() => undefined)}
        >
          <Share2 /> Share link
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* clipboard blocked — the URL is visible on the page */
          }
        }}
      >
        {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}
