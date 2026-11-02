"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { transferTicket } from "./actions";

/** Give this ticket to someone on GigTrotter. The old QR stops working. */
export function TransferTicket({ ticketId }: { ticketId: string }) {
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          try {
            await transferTicket(ticketId, username);
            setMsg("Sent. This ticket now lives in their wallet and your QR no longer works.");
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "Could not transfer.");
          }
        });
      }}
    >
      <Input aria-label="Their username" placeholder="@friend" value={username} onChange={(e) => setUsername(e.target.value)} className="w-44" />
      <Button type="submit" size="sm" variant="outline" disabled={pending || username.trim().length < 3}>
        <Send /> {pending ? "Sending…" : "Send this ticket"}
      </Button>
      {msg ? <p className="w-full text-xs text-muted-foreground" role="status">{msg}</p> : null}
    </form>
  );
}
