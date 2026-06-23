"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { deleteMyAccount } from "./actions";

/**
 * Destructive account deletion with a type-to-confirm guard. Required for the
 * App Store (Guideline 5.1.1(v)) and to honour the deletion promise in our
 * Privacy Policy / Terms. The server action does the irreversible erasure and
 * redirects home on success.
 */
export function DeleteAccountButton() {
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canDelete = text.trim().toUpperCase() === "DELETE";

  if (!confirming) {
    return (
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setConfirming(true)}
      >
        Delete account
      </Button>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-start gap-2 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="font-medium">
          This permanently deletes your account, captures, wallet, and map.
          It can&apos;t be undone.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Type <span className="font-mono font-semibold">DELETE</span> to confirm.
      </p>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="DELETE"
        className="max-w-[220px]"
        aria-label="Type DELETE to confirm account deletion"
      />
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setConfirming(false);
            setText("");
            setError(null);
          }}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={!canDelete || pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                await deleteMyAccount();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Could not delete account.",
                );
              }
            })
          }
        >
          {pending ? "Deleting…" : "Permanently delete"}
        </Button>
      </div>
    </div>
  );
}
