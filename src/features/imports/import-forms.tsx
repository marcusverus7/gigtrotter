"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { importFromCsv, importFromSetlistfm } from "./actions";

type Result = { found: number; imported: number; duplicates: number };

function Outcome({ r }: { r: Result }) {
  return (
    <p className="text-sm" role="status">
      Found {r.found}, added {r.imported}
      {r.duplicates > 0 ? `, ${r.duplicates} already in your wallet` : ""}. They are on your map now.
    </p>
  );
}

export function SetlistfmImportForm({ enabled }: { enabled: boolean }) {
  const [username, setUsername] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!enabled) {
    return (
      <p className="text-xs text-muted-foreground">
        Needs a setlist.fm API key on the server — coming soon.
      </p>
    );
  }
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setResult(null);
        start(async () => {
          try {
            setResult(await importFromSetlistfm(username));
          } catch (err) {
            setError(err instanceof Error ? err.message : "Import failed.");
          }
        });
      }}
    >
      <Input
        aria-label="setlist.fm username"
        placeholder="Your setlist.fm username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoCapitalize="none"
        autoCorrect="off"
      />
      <Button type="submit" size="sm" className="w-full" disabled={pending || username.trim().length < 2}>
        <Download /> {pending ? "Importing…" : "Import attended shows"}
      </Button>
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
      {result ? <Outcome r={result} /> : null}
    </form>
  );
}

export function CsvImportForm() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setResult(null);
        start(async () => {
          try {
            setResult(await importFromCsv(text));
          } catch (err) {
            setError(err instanceof Error ? err.message : "Import failed.");
          }
        });
      }}
    >
      <textarea
        aria-label="Gigs, one per line"
        className="min-h-28 w-full rounded-md border border-input bg-background p-3 font-mono text-sm"
        placeholder={"date, artist, venue, city\n2024-06-14, IDLES, Marble Factory, Bristol\n14/11/2023, Fontaines D.C., 3Arena, Dublin"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button type="submit" size="sm" className="w-full" disabled={pending || text.trim().length < 8}>
        <Download /> {pending ? "Importing…" : "Add these gigs"}
      </Button>
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
      {result ? <Outcome r={result} /> : null}
    </form>
  );
}
