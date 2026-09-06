"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { sendFriendRequest } from "./actions";

export function AddFriendForm() {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await sendFriendRequest(username);
        toast.success(`Request sent to @${username.replace(/^@/, "")}`);
        setUsername("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not send request.");
      }
    });
  }

  // Both messages were `absolute mt-12` inside a non-relative form, so they
  // painted over the friends list below rather than taking a line of their
  // own — and the success text duplicated the toast fired one line earlier.
  // The toast keeps the success case; the error gets a real line.
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
      <Input
        placeholder="Add by username (e.g. @markl)"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        aria-label="Friend's username"
      />
      <Button type="submit" disabled={pending || !username}>
        <UserPlus /> Request
      </Button>
      {error ? (
        <p className="w-full text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
