"use client";

import { useTransition } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

import { removeWishlistItem } from "./actions";

export function WishlistDeleter({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => startTransition(() => removeWishlistItem(id))}
      disabled={pending}
      className="opacity-0 transition-opacity group-hover:opacity-100"
      aria-label="Remove"
    >
      <X className="h-4 w-4" />
    </Button>
  );
}
