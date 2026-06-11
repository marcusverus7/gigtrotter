"use client";

import { useState, useTransition, useRef } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Send, Shield, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { createDiscussionPost, uploadDiscussionPhoto } from "./actions";

export function PostComposer({
  eventId,
  canPost,
}: {
  eventId: string;
  canPost: boolean;
}) {
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [uploading, startUpload] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  if (!canPost) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center">
        <Shield className="mx-auto h-6 w-6 text-muted-foreground/40" />
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          View only
        </p>
        <p className="text-xs text-muted-foreground">
          Purchase your ticket through GigTrotter to unlock posting, photos,
          and reactions. You&apos;ll also get the{" "}
          <Badge
            variant="verified"
            className="inline-flex gap-0.5 px-1 py-0 text-[9px]"
          >
            <Shield className="h-2 w-2 fill-current" />
            purple tick
          </Badge>{" "}
          on your profile.
        </p>
      </div>
    );
  }

  function onPickPhoto() {
    fileRef.current?.click();
  }

  function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("photo", file);
    startUpload(async () => {
      try {
        const url = await uploadDiscussionPhoto(fd);
        setPhotos((prev) => [...prev, url]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed.");
      }
    });
    e.target.value = "";
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() && photos.length === 0) return;
    startTransition(async () => {
      try {
        await createDiscussionPost({
          eventId,
          body: body.trim() || null,
          photos,
        });
        setBody("");
        setPhotos([]);
        toast.success("Posted!");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't post.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Share your experience, thoughts, photos..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="flex-1"
          maxLength={2000}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={onPhotoSelected}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onPickPhoto}
          disabled={uploading || photos.length >= 6}
        >
          {uploading ? (
            <Camera className="h-4 w-4 animate-pulse" />
          ) : (
            <ImagePlus className="h-4 w-4" />
          )}
        </Button>
        <Button
          type="submit"
          size="icon"
          disabled={pending || (!body.trim() && photos.length === 0)}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {photos.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto">
          {photos.map((url, i) => (
            <div key={i} className="relative shrink-0">
              <img
                src={url}
                alt=""
                className="h-16 w-16 rounded-md border border-border object-cover"
              />
              <button
                type="button"
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                onClick={() => removePhoto(i)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <p className="self-center text-[10px] text-muted-foreground">
            {photos.length}/6
          </p>
        </div>
      ) : null}
    </form>
  );
}
