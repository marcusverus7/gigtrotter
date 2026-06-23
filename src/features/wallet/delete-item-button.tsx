"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { deleteWalletItem } from "./wallet-item-actions";

export function DeleteItemButton({ itemId }: { itemId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onDelete() {
    startTransition(async () => {
      try {
        await deleteWalletItem(itemId);
        toast.success("Removed from your wallet.");
        router.push("/app");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not delete.");
        setConfirming(false);
      }
    });
  }

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs text-destructive/70 hover:text-destructive hover:bg-destructive/10"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="h-3 w-3" />
        Delete
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-destructive/80">
        Delete item
      </p>
      <p className="text-sm text-muted-foreground">
        Delete this from your wallet? This can&apos;t be undone.
      </p>
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={pending}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {pending ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </div>
  );
}
