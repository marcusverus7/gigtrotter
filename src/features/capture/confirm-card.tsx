"use client";

import { useState, useTransition } from "react";
import { Check, X, AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Audience } from "@/lib/supabase/types";
import type { ParsedCapture, CaptureKind } from "@/lib/capture/schema";

import { confirmCapture, rejectCapture } from "./actions";

/**
 * The confirm card. Per §6.1 — never a silent write. Every parse lands here,
 * with every field editable, before promotion to wallet_item / experience.
 */
export function ConfirmCard({
  captureId,
  parsed,
  onDone,
}: {
  captureId: string;
  parsed: ParsedCapture;
  onDone?: () => void;
}) {
  const [kind, setKind] = useState<CaptureKind>(parsed.kind);
  const [title, setTitle] = useState(parsed.title);
  const [venueName, setVenueName] = useState(parsed.destination?.name ?? "");
  const [city, setCity] = useState(parsed.destination?.city ?? "");
  const [country, setCountry] = useState(parsed.destination?.country ?? "");
  const [startsAt, setStartsAt] = useState(parsed.starts_at ?? "");
  const [endsAt, setEndsAt] = useState(parsed.ends_at ?? "");
  const [audience, setAudience] = useState<Audience>("inner");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const lowConfidence = parsed.confidence < 0.6;

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await confirmCapture({
          captureId,
          kind,
          title,
          subtitle: city || venueName || null,
          starts_at: startsAt || null,
          ends_at: endsAt || null,
          audience,
          venue: venueName
            ? { name: venueName, city: city || null, country: country || null }
            : null,
        });
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });
  }

  function onReject() {
    startTransition(async () => {
      await rejectCapture(captureId);
      onDone?.();
    });
  }

  return (
    <Card className="animate-fade-in border-primary/30">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base">Confirm this capture</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={lowConfidence ? "outline" : "verified"}>
              {(parsed.confidence * 100).toFixed(0)}% confident
            </Badge>
            {parsed.vendor ? (
              <Badge variant="outline">{parsed.vendor}</Badge>
            ) : null}
          </div>
        </div>
        {lowConfidence ? (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-yellow-500/10 p-2 text-xs text-yellow-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            Confidence is low — check every field before confirming.
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind">
            <Select value={kind} onValueChange={(v) => setKind(v as CaptureKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ticket">Ticket</SelectItem>
                <SelectItem value="flight">Flight</SelectItem>
                <SelectItem value="stay">Stay</SelectItem>
                <SelectItem value="restaurant">Restaurant</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Audience">
            <Select
              value={audience}
              onValueChange={(v) => setAudience(v as Audience)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vault">Vault (only you)</SelectItem>
                <SelectItem value="inner">Inner Circle</SelectItem>
                <SelectItem value="friends">Friends (past only)</SelectItem>
                <SelectItem value="open">Open (past only)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <Input
              type="datetime-local"
              value={startsAt ? toLocalDT(startsAt) : ""}
              onChange={(e) =>
                setStartsAt(e.target.value ? `${e.target.value}:00.000Z` : "")
              }
            />
          </Field>
          <Field label="Ends">
            <Input
              type="datetime-local"
              value={endsAt ? toLocalDT(endsAt) : ""}
              onChange={(e) =>
                setEndsAt(e.target.value ? `${e.target.value}:00.000Z` : "")
              }
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Venue">
            <Input
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              placeholder="Alexandra Palace"
            />
          </Field>
          <Field label="City">
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="London"
            />
          </Field>
          <Field label="Country">
            <Input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="UK"
            />
          </Field>
        </div>

        {parsed.details.length > 0 ? (
          <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Extras detected</p>
            <ul className="mt-1 list-disc pl-5">
              {parsed.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onReject}
            disabled={pending}
            type="button"
          >
            <X /> Discard
          </Button>
          <Button onClick={onConfirm} disabled={pending} type="button">
            <Check /> {pending ? "Saving…" : "Confirm"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// HTML datetime-local wants `YYYY-MM-DDTHH:mm`, not full ISO.
function toLocalDT(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate(),
    )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}
