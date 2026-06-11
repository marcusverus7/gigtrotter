"use client";

import { Share2, Clock } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { publicEnv } from "@/lib/env";

export function CountdownShare({
  walletItemId,
  title,
  daysUntil,
}: {
  walletItemId: string;
  title: string;
  daysUntil: number;
}) {
  const [copied, setCopied] = useState(false);

  const cardUrl = `${publicEnv.siteUrl}/api/countdown/${walletItemId}`;
  const shareText = `${daysUntil} ${daysUntil === 1 ? "day" : "days"} until ${title}`;

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareText, url: cardUrl });
        return;
      } catch {
        // user cancelled or not supported — fall through to clipboard
      }
    }

    await navigator.clipboard.writeText(cardUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Clock className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {daysUntil} {daysUntil === 1 ? "day" : "days"} to go
        </p>
        <p className="truncate text-xs text-muted-foreground">
          Share the countdown card
        </p>
      </div>
      <Button onClick={handleShare} variant="outline" size="sm">
        <Share2 className="mr-1.5 h-3.5 w-3.5" />
        {copied ? "Copied!" : "Share"}
      </Button>
    </div>
  );
}
