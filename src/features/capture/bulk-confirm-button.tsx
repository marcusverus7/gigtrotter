"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

import { confirmConfidentCaptures } from "./bulk-confirm";

export function BulkConfirmButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  if (count === 0) return null;
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const r = await confirmConfidentCaptures({
                minConfidence: 0.8,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              });
              setNote(`Confirmed ${r.confirmed}${r.skipped ? `, left ${r.skipped} for you to check` : ""}.`);
              router.refresh();
            } catch (e) {
              setNote(e instanceof Error ? e.message : "Could not confirm.");
            }
          })
        }
      >
        <CheckCheck /> {pending ? "Confirming…" : `Confirm the ${count} confident ${count === 1 ? "one" : "ones"}`}
      </Button>
      {note ? <p className="text-xs text-muted-foreground" role="status">{note}</p> : null}
    </div>
  );
}
