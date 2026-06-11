"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

/**
 * Compact sidebar search button. Visually invites the user; pressing it
 * fires the same Cmd+K keystroke that opens the palette so we don't have
 * to thread state through the layout.
 */
export function SidebarSearchTrigger() {
  const [mac, setMac] = useState(false);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/i.test(navigator.platform));
  }, []);

  function open() {
    const e = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: mac,
      ctrlKey: !mac,
    });
    window.dispatchEvent(e);
  }

  return (
    <button
      onClick={open}
      type="button"
      className="mt-6 flex items-center gap-2 rounded-md border border-border/60 bg-card/40 px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="flex-1 text-left">Search…</span>
      <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
        {mac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}
