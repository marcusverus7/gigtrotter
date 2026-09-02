import { Clock } from "lucide-react";

import { createClient, getSessionUser } from "@/lib/supabase/server";
import { ParsedCaptureSchema } from "@/lib/capture/schema";

import { ConfirmCard } from "./confirm-card";

export async function PendingCaptures() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return null;

  const { data: captures } = await supabase
    .from("captures")
    .select("id, parse_json, confidence, vendor, status, created_at, error")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);

  if (!captures || captures.length === 0) return null;

  // Validate rather than cast. `parse_json` is stored JSON — rows written before
  // a schema change won't carry newer fields, and a bare cast would hand the UI
  // `undefined` where the type promises a value. safeParse applies the schema's
  // defaults, so older rows normalise instead of rendering half-empty. Anything
  // genuinely unreadable is dropped rather than crashing the whole queue.
  const pending = captures.flatMap((c) => {
    const result = ParsedCaptureSchema.safeParse(c.parse_json);
    return result.success ? [{ id: c.id, parsed: result.data }] : [];
  });

  if (pending.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" />
        {pending.length} waiting to confirm
      </div>
      {pending.map((c) => (
        <ConfirmCard key={c.id} captureId={c.id} parsed={c.parsed} />
      ))}
    </div>
  );
}
