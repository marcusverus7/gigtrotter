"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Plus, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";

import { addToWalletFromEvent } from "./actions";

export function AddToWalletButton({ eventId }: { eventId: string }) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        await addToWalletFromEvent(eventId);
        toast.success("Added to your wallet!");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Couldn't add to wallet.";
        if (msg.includes("already in your wallet")) {
          toast.info("This event is already in your wallet.");
        } else {
          toast.error(msg);
        }
      }
    });
  }

  return (
    <Button
      onClick={onClick}
      disabled={pending}
      variant="outline"
      className="w-full"
    >
      <Wallet className="mr-2 h-4 w-4" />
      {pending ? "Adding…" : "Add to wallet"}
    </Button>
  );
}
