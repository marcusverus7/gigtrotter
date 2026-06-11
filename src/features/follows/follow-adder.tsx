"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { follow } from "./actions";

export function FollowAdder() {
  const [kind, setKind] = useState<"artist" | "promoter" | "venue">("artist");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await follow({ kind, name });
        setName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't follow.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <SelectTrigger className="w-32 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="artist">Artist</SelectItem>
            <SelectItem value="promoter">Promoter</SelectItem>
            <SelectItem value="venue">Venue</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder={
            kind === "artist"
              ? "Fontaines D.C., Phoebe Bridgers…"
              : kind === "promoter"
                ? "AEG, Live Nation, Resident Advisor…"
                : "Alexandra Palace, Brixton Academy…"
          }
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={pending || !name}>
          <Plus />
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
