"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Star, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { rateAttended, dismissMorningAfter } from "./morning-after-actions";

/**
 * Morning-after prompt (§8.2). Day-after surface that asks "how was it?" —
 * one-tap rating, optional review, optional photo. The single best
 * content-quality feature per the plan. Wires nothing to push yet; the
 * native app will trigger this card from a push notification in V1.
 */
export function MorningAfterPrompt({
  walletItemId,
  experienceId,
  title,
  subtitle,
}: {
  walletItemId: string;
  experienceId: string | null;
  title: string;
  subtitle: string | null;
}) {
  const [rating, setRating] = useState<number>(0);
  const [review, setReview] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!rating) return;
    startTransition(async () => {
      await rateAttended({
        walletItemId,
        experienceId,
        rating,
        review: review.trim() || null,
      });
      setDone(true);
    });
  }

  function dismiss() {
    startTransition(async () => {
      await dismissMorningAfter(walletItemId);
      setDone(true);
    });
  }

  if (done) return null;

  return (
    <Card className="overflow-hidden border-secondary/40 bg-gradient-to-br from-secondary/10 via-card to-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge variant="verified">Morning after</Badge>
            <CardTitle className="mt-2 text-xl">How was {title}?</CardTitle>
            {subtitle ? (
              <CardDescription>{subtitle}</CardDescription>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={dismiss}
            disabled={pending}
            aria-label="Dismiss"
          >
            <X />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setRating(n)}
              type="button"
              className={cn(
                "group flex-1 rounded-lg border border-border bg-card/40 p-3 transition-all hover:-translate-y-0.5 hover:border-primary/40",
                rating >= n && "border-primary/60 bg-primary/10",
              )}
              aria-label={`${n} star`}
            >
              <Star
                className={cn(
                  "mx-auto h-6 w-6 transition-colors",
                  rating >= n ? "fill-primary text-primary" : "text-muted-foreground",
                )}
              />
            </button>
          ))}
        </div>

        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          maxLength={500}
          placeholder="A line, if you want. Saved with your pin."
          className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          rows={2}
        />

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={dismiss}
            disabled={pending}
          >
            Maybe later
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={pending || rating === 0}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Want to add photos?{" "}
          <Link
            href={`/app/item/${walletItemId}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            Open the pin
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
