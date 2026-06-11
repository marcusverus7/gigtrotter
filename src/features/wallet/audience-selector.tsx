"use client";

import { useState, useTransition } from "react";
import { Lock, Globe, Users, Heart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Audience } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

import { setAudience } from "./actions";

const OPTIONS: { value: Audience; label: string; desc: string; icon: typeof Lock }[] = [
  { value: "vault", label: "Vault", desc: "Only you.", icon: Lock },
  { value: "inner", label: "Inner", desc: "Hand-picked Circle.", icon: Heart },
  { value: "friends", label: "Friends", desc: "Accepted bilateral. Past only.", icon: Users },
  { value: "open", label: "Open", desc: "Public + anon. Past only.", icon: Globe },
];

export function AudienceSelector({
  experienceId,
  audience,
}: {
  experienceId: string;
  audience: Audience;
}) {
  const [current, setCurrent] = useState<Audience>(audience);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(next: Audience) {
    setError(null);
    setCurrent(next);
    startTransition(async () => {
      try {
        await setAudience(experienceId, next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update.");
        setCurrent(audience); // revert
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Audience</CardTitle>
        <CardDescription>
          Who can see this pin. Future events are always Inner-only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {OPTIONS.map((o) => {
            const active = current === o.value;
            return (
              <Button
                key={o.value}
                variant={active ? "default" : "outline"}
                onClick={() => change(o.value)}
                disabled={pending}
                className={cn(
                  "flex h-auto flex-col items-start gap-1 px-3 py-2 text-left",
                )}
              >
                <span className="flex items-center gap-2">
                  <o.icon className="h-4 w-4" />
                  {o.label}
                </span>
                <span className="text-xs font-normal opacity-80">{o.desc}</span>
              </Button>
            );
          })}
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
