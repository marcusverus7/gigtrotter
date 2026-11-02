"use client";

import { useState, useTransition } from "react";
import { Gift } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { issueCompTicket } from "./actions";

/** Give a ticket away: guest list, competition winner, the band's mate. */
export function CompForm({ eventId, tiers }: { eventId: string; tiers: Array<{ id: string; name: string }> }) {
  const [username, setUsername] = useState("");
  const [tierId, setTierId] = useState(tiers[0]?.id ?? "");
  const [note, setNote] = useState("guest list");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (tiers.length === 0) return null;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          try {
            await issueCompTicket(eventId, tierId, username, note);
            setMsg(`Sent to @${username.replace(/^@/, "")} — it's in their wallet.`);
            setUsername("");
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "Could not issue.");
          }
        });
      }}
    >
      <Input aria-label="Username" placeholder="@username" value={username} onChange={(e) => setUsername(e.target.value)} className="w-40" />
      <select aria-label="Ticket type" value={tierId} onChange={(e) => setTierId(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
        {tiers.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <Input aria-label="Reason" value={note} onChange={(e) => setNote(e.target.value)} className="w-36" />
      <Button type="submit" size="sm" disabled={pending || username.trim().length < 3}>
        <Gift /> {pending ? "Sending…" : "Give a ticket"}
      </Button>
      {msg ? <p className="w-full text-xs text-muted-foreground" role="status">{msg}</p> : null}
    </form>
  );
}
