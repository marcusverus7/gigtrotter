"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  Plane,
  Search,
  Ticket,
  UserCircle,
  type LucideIcon,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

import { search, type SearchHit } from "./actions";

const KIND_ICON: Record<SearchHit["kind"], LucideIcon> = {
  wallet: Ticket,
  experience: Ticket,
  wishlist: Bookmark,
  friend: UserCircle,
  trip: Plane,
};

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  wallet: "Wallet",
  experience: "Pin",
  wishlist: "Wishlist",
  friend: "Friend",
  trip: "Trip",
};

/**
 * Cmd+K palette. Lives at the app shell. Sub-200ms responsiveness via
 * a debounced server-action call inside startTransition.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setHits([]);
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    debounce.current = setTimeout(() => {
      startTransition(async () => {
        const r = await search(query);
        setHits(r);
        setActive(0);
      });
    }, 150);
  }, [query]);

  function go(hit: SearchHit) {
    setOpen(false);
    router.push(hit.href);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(hits.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      go(hits[active]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogTitle className="sr-only">Search GigTrotter</DialogTitle>
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search wallet, pins, wishlist, friends…"
            className="flex-1 bg-transparent text-base placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            esc
          </kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {query.length < 2 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Type to search.
            </p>
          ) : hits.length === 0 && !pending ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing here.
            </p>
          ) : (
            <ul>
              {hits.map((hit, i) => {
                const Icon = KIND_ICON[hit.kind];
                const date = hit.date
                  ? new Intl.DateTimeFormat(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }).format(new Date(hit.date))
                  : "";
                return (
                  <li key={`${hit.kind}-${hit.id}`}>
                    <button
                      type="button"
                      onClick={() => go(hit)}
                      onMouseEnter={() => setActive(i)}
                      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        active === i
                          ? "bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:bg-accent/30"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">
                          {hit.title}
                        </p>
                        {hit.subtitle ? (
                          <p className="truncate text-xs">{hit.subtitle}</p>
                        ) : null}
                      </div>
                      <span className="hidden font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
                        {KIND_LABEL[hit.kind]}
                      </span>
                      {date ? (
                        <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                          {date}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-border px-5 py-2 text-[10px] text-muted-foreground">
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">
            ↑↓
          </kbd>{" "}
          navigate ·{" "}
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">
            ↵
          </kbd>{" "}
          open ·{" "}
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">
            esc
          </kbd>{" "}
          close
        </div>
      </DialogContent>
    </Dialog>
  );
}
