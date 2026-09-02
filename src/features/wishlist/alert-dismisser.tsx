"use client";

import { useTransition } from "react";
import { X } from "lucide-react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { markAlertState } from "./actions";

export function AlertDismisser({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() =>
        startTransition(async () => {
          try {
            await markAlertState(id, "dismissed");
          } catch {
            toast.error("Couldn't dismiss — try again.");
          }
        })
      }
      disabled={pending}
      aria-label="Dismiss"
    >
      <X className="h-4 w-4" />
    </Button>
  );
}
