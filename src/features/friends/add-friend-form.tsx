"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { sendFriendRequest } from "./actions";

export function AddFriendForm() {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await sendFriendRequest(username);
        setSuccess(`Request sent to @${username.replace(/^@/, "")}`);
        setUsername("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not send request.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <Input
        placeholder="Add by username (e.g. @markl)"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <Button type="submit" disabled={pending || !username}>
        <UserPlus /> Request
      </Button>
      {error ? (
        <p className="absolute mt-12 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="absolute mt-12 text-sm text-secondary">{success}</p>
      ) : null}
    </form>
  );
}
