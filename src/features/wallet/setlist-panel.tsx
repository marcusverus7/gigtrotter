"use client";

import { useEffect, useState, useTransition } from "react";
import { ExternalLink, ListMusic } from "lucide-react";

import type { StoredSetlist } from "@/lib/setlistfm/map";

import { fetchSetlist } from "./setlist-actions";

/**
 * The songs played, on the pin. Fetched the first time the pin is opened
 * after the gig; shown from the row every time after. "Relive it" opens the
 * artist in the listener's own music app via a search link, which needs no
 * OAuth and works inside the shells.
 */
export function SetlistPanel({
  experienceId,
  initial,
  checked,
  artist,
}: {
  experienceId: string;
  initial: StoredSetlist | null;
  checked: boolean;
  artist: string;
}) {
  const [setlist, setSetlist] = useState<StoredSetlist | null>(initial);
  const [state, setState] = useState<"idle" | "looking" | "none" | "unconfigured">(
    initial ? "idle" : checked ? "none" : "idle",
  );
  const [, start] = useTransition();

  useEffect(() => {
    if (initial || checked) return;
    setState("looking");
    start(async () => {
      try {
        const r = await fetchSetlist(experienceId);
        if (r === "unconfigured") setState("unconfigured");
        else if (r) {
          setSetlist(r);
          setState("idle");
        } else setState("none");
      } catch {
        setState("none");
      }
    });
  }, [experienceId, initial, checked]);

  if (state === "unconfigured") return null;
  const search = `https://open.spotify.com/search/${encodeURIComponent(artist)}`;

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          <ListMusic className="h-3.5 w-3.5" /> Setlist
        </p>
        <a
          href={search}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[36px] items-center gap-1 text-xs font-medium text-primary"
        >
          Relive it <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      {state === "looking" ? (
        <p className="mt-2 text-sm text-muted-foreground">Looking up what they played…</p>
      ) : setlist ? (
        <>
          {setlist.tour ? <p className="mt-1 text-xs text-muted-foreground">{setlist.tour}</p> : null}
          <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {setlist.songs.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground tnum">{i + 1}</span>
                <span>
                  {s.name}
                  {s.cover ? <span className="text-muted-foreground"> ({s.cover} cover)</span> : null}
                  {s.encore ? <span className="ml-1 text-[10px] uppercase text-muted-foreground">encore</span> : null}
                </span>
              </li>
            ))}
          </ol>
          {setlist.url ? (
            <a
              href={setlist.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Setlist from setlist.fm
            </a>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">No setlist on setlist.fm for this one yet.</p>
      )}
    </div>
  );
}
