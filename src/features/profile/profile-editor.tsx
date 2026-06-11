"use client";

import { useState, useTransition, useRef } from "react";
import { Camera, Save } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { updateProfile, uploadAvatar } from "./edit-actions";

export function ProfileEditor({
  profile,
}: {
  profile: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [username, setUsername] = useState(profile.username);
  const [pending, startTransition] = useTransition();
  const [avatarPending, startAvatar] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await updateProfile({ display_name: displayName, username });
        setMessage("Saved.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  function onPick() {
    fileRef.current?.click();
  }

  function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setMessage(null);
    const fd = new FormData();
    fd.append("avatar", f);
    startAvatar(async () => {
      try {
        await uploadAvatar(fd);
        setMessage("Avatar updated.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't upload.");
      }
    });
  }

  const initials = (profile.display_name ?? profile.username)
    .slice(0, 2)
    .toUpperCase();

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarImage src={profile.avatar_url ?? undefined} alt="" />
          <AvatarFallback className="text-base">{initials}</AvatarFallback>
        </Avatar>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={onAvatar}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onPick}
            disabled={avatarPending}
          >
            <Camera /> {avatarPending ? "Uploading…" : "Change avatar"}
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            PNG, JPG or WebP. Under 4MB.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="display_name">Display name</Label>
          <Input
            id="display_name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Mark Loughran"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            value={username}
            onChange={(e) =>
              setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
            }
            placeholder="markl"
          />
          <p className="text-xs text-muted-foreground">
            3–30 chars, lowercase letters, numbers, underscores.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="text-sm text-secondary">{message}</p>
          ) : null}
        </div>
        <Button type="submit" disabled={pending}>
          <Save /> {pending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
