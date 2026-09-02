"use client";

import { toast } from "sonner";
import { useRef, useState, useTransition } from "react";
import { Camera, Star, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  removeExperiencePhoto,
  saveReview,
  uploadExperiencePhoto,
} from "./experience-editor-actions";

type Props = {
  experienceId: string;
  initialRating: number | null;
  initialReview: string | null;
  photoUrls: { key: string; url: string }[];
};

/**
 * The expanded review surface for a past pin. Star tap → save inline.
 * Review autosaves on blur. Photos upload one at a time with progress.
 */
export function ExperienceEditor({
  experienceId,
  initialRating,
  initialReview,
  photoUrls,
}: Props) {
  const [rating, setRating] = useState<number>(initialRating ?? 0);
  const [review, setReview] = useState(initialReview ?? "");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();

  function persist(nextRating: number, nextReview: string) {
    setError(null);
    startTransition(async () => {
      try {
        await saveReview({
          experienceId,
          rating: nextRating,
          review: nextReview.trim() || null,
        });
        setSavedAt(Date.now());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  function setStars(n: number) {
    // Tap the active star again to clear.
    const next = n === rating ? 0 : n;
    setRating(next);
    persist(next, review);
  }

  function onAddPhoto() {
    fileRef.current?.click();
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("experienceId", experienceId);
    fd.append("photo", f);
    setError(null);
    startUpload(async () => {
      try {
        await uploadExperiencePhoto(fd);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't upload.");
      }
    });
    e.target.value = "";
  }

  function removePhoto(key: string) {
    startUpload(async () => {
      try {
        await removeExperiencePhoto(experienceId, key);
      } catch {
        toast.error("Couldn't remove that photo — try again.");
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Rating row */}
      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
          Rating
        </p>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setStars(n)}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              className="group rounded-md p-1"
            >
              <Star
                className={cn(
                  "h-7 w-7 transition-colors",
                  rating >= n
                    ? "fill-primary text-primary"
                    : "text-muted-foreground/40 group-hover:text-muted-foreground",
                )}
              />
            </button>
          ))}
          {pending ? (
            <span className="ml-2 text-xs text-muted-foreground">Saving…</span>
          ) : savedAt ? (
            <span className="ml-2 text-xs text-secondary">Saved.</span>
          ) : null}
        </div>
      </div>

      {/* Review */}
      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
          Review
        </p>
        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          onBlur={() =>
            (review || "") !== (initialReview ?? "") && persist(rating, review)
          }
          maxLength={1500}
          rows={4}
          placeholder="A line — or paragraphs. Stays on your pin."
          className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Photos */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Photos
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddPhoto}
            disabled={uploading}
          >
            <Camera /> {uploading ? "Uploading…" : "Add photo"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onPhoto}
            className="sr-only"
          />
        </div>
        {photoUrls.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-card/30 p-4 text-center text-xs text-muted-foreground">
            Drop photos here when you remember the night.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {photoUrls.map(({ key, url }) => (
              <div
                key={key}
                className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
              >
                {/* Photos are signed URLs from a private bucket — img tag is fine */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(key)}
                  className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-background/70 backdrop-blur transition-opacity md:opacity-0 md:group-hover:opacity-100"
                  aria-label="Remove photo"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
