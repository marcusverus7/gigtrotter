import { Clock } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import type { ParsedCapture } from "@/lib/capture/schema";

import { ConfirmCard } from "./confirm-card";

export async function PendingCaptures() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: captures } = await supabase
    .from("captures")
    .select("id, parse_json, confidence, vendor, status, created_at, error")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);

  if (!captures || captures.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" />
        {captures.length} waiting to confirm
      </div>
      {captures.map((c) => (
        <ConfirmCard
          key={c.id}
          captureId={c.id}
          parsed={c.parse_json as unknown as ParsedCapture}
        />
      ))}
    </div>
  );
}
