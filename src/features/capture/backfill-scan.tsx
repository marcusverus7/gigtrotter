"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, UploadCloud, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BATCH_LIMIT = 50;
const CONCURRENT = 3;

/**
 * Multi-file backfill. We send images to /api/captures in batches of three
 * to keep the UI responsive. The actual cost ceiling is the per-user daily
 * quota enforced inside ingestCapture — for a long time this comment claimed
 * the parser enforced one, and it never did.
 */
export function BackfillScan() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Map<string, "pending" | "done" | "error">>(
    new Map(),
  );
  const [pending, startTransition] = useTransition();

  function pick() {
    inputRef.current?.click();
  }

  function onFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, BATCH_LIMIT);
    setFiles(arr);
    setProgress(new Map(arr.map((f) => [f.name, "pending"] as const)));
  }

  async function uploadOne(file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("source", "screenshot");
    const res = await fetch("/api/captures", { method: "POST", body: form });
    setProgress((p) => {
      const next = new Map(p);
      next.set(file.name, res.ok ? "done" : "error");
      return next;
    });
  }

  function run() {
    if (files.length === 0) return;
    startTransition(async () => {
      // Sliding window of `CONCURRENT` uploads.
      const queue = [...files];
      const workers: Promise<void>[] = [];
      const worker = async () => {
        while (queue.length) {
          const file = queue.shift();
          if (!file) return;
          await uploadOne(file);
        }
      };
      for (let i = 0; i < CONCURRENT; i++) workers.push(worker());
      await Promise.all(workers);
    });
  }

  const done = [...progress.values()].filter((v) => v === "done").length;
  const errored = [...progress.values()].filter((v) => v === "error").length;
  const allFinished = files.length > 0 && done + errored === files.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="sr-only"
          onChange={(e) => onFiles(e.target.files)}
        />
        <Button type="button" onClick={pick} variant="outline">
          <UploadCloud /> Pick screenshots…
        </Button>
        <Button type="button" onClick={run} disabled={files.length === 0 || pending}>
          {pending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <>Run scan ({files.length})</>
          )}
        </Button>
        {files.length === BATCH_LIMIT ? (
          <span className="text-xs text-muted-foreground">
            Max {BATCH_LIMIT} per batch. Run again for the rest.
          </span>
        ) : null}
      </div>

      {files.length > 0 ? (
        <div className="max-h-72 overflow-auto rounded-md border border-border bg-muted/20 p-3">
          <ul className="space-y-1.5 text-sm">
            {files.map((f) => {
              const state = progress.get(f.name) ?? "pending";
              return (
                <li key={f.name} className="flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {f.name}
                  </span>
                  <StateIcon state={state} />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {allFinished ? (
        <div className="flex items-center justify-between rounded-md bg-secondary/10 p-3 text-sm">
          <span>
            Done. {done} parsed{errored > 0 ? `, ${errored} failed` : ""}.
          </span>
          <Button asChild size="sm">
            <Link href="/app/capture">Review confirm cards</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function StateIcon({ state }: { state: "pending" | "done" | "error" }) {
  const className = cn(
    "h-4 w-4",
    state === "done" && "text-secondary",
    state === "error" && "text-destructive",
    state === "pending" && "text-muted-foreground",
  );
  if (state === "done") return <CheckCircle2 className={className} />;
  if (state === "error") return <XCircle className={className} />;
  return <Loader2 className={cn(className, "animate-spin")} />;
}
