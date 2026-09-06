"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, UploadCloud, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BATCH_LIMIT = 50;
const CONCURRENT = 3;

/**
 * Multi-file backfill. We send images to /api/captures in batches of three
 * to keep the UI responsive. The actual cost ceiling is the per-user daily
 * quota enforced inside ingestCapture — for a long time this comment claimed
 * the parser enforced one, and it never did.
 *
 * Two outcomes used to be indistinguishable from a red X: the daily quota
 * (429, and every remaining file will fail the same way) and a one-off
 * network blip. A third was worse — an upload the model could not read comes
 * back 200 with a placeholder parse, so "50 parsed" could mean fifty red
 * "Manual entry" cards waiting on the confirm page. Each of those now says
 * what happened, and hitting the quota stops the batch instead of burning
 * through the rest of the queue.
 */

type FileState =
  | { state: "pending" }
  | { state: "done" }
  | { state: "manual" }
  | { state: "error"; reason: string };

export function BackfillScan() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Map<number, FileState>>(new Map());
  const [quotaHit, setQuotaHit] = useState(false);
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
    setQuotaHit(false);
    // Keyed by INDEX, not name — camera-roll exports reuse names like
    // IMG_0001.jpg, and name collisions merged progress entries so the batch
    // could never read as finished (and React keys duplicated).
    setProgress(new Map(arr.map((_, i) => [i, { state: "pending" } as FileState])));
  }

  async function uploadOne(file: File, index: number): Promise<"ok" | "quota" | "failed"> {
    let result: FileState;
    let outcome: "ok" | "quota" | "failed" = "failed";
    try {
      const res = await fetch("/api/captures", { method: "POST", body: buildForm(file) });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        // confidence 0 with the placeholder title is the pipeline saying "the
        // model could not read this" — a confirm card the user must fill in
        // by hand, not a parse.
        const parsed = body?.parsed as { confidence?: number } | undefined;
        result =
          parsed && parsed.confidence === 0 ? { state: "manual" } : { state: "done" };
        outcome = "ok";
      } else if (res.status === 429) {
        result = { state: "error", reason: "Daily limit reached" };
        outcome = "quota";
      } else {
        result = {
          state: "error",
          reason: typeof body?.error === "string" ? body.error : `Upload failed (${res.status})`,
        };
      }
    } catch {
      // One dropped request must not kill the batch: before this, a single
      // fetch rejection blew up Promise.all and every remaining file spun as
      // "pending" forever.
      result = { state: "error", reason: "Network error — try this one again" };
    }
    setProgress((p) => new Map(p).set(index, result));
    return outcome;
  }

  function run() {
    if (files.length === 0) return;
    setQuotaHit(false);
    startTransition(async () => {
      // Sliding window of `CONCURRENT` uploads.
      const queue = files.map((f, i) => [f, i] as const);
      let stop = false;
      const worker = async () => {
        while (queue.length && !stop) {
          const entry = queue.shift();
          if (!entry) return;
          const outcome = await uploadOne(entry[0], entry[1]);
          if (outcome === "quota") {
            // Every remaining file would fail identically. Drain the queue so
            // the untried ones read as untried rather than failed.
            stop = true;
            setQuotaHit(true);
            const rest = queue.splice(0, queue.length);
            setProgress((p) => {
              const next = new Map(p);
              for (const [, i] of rest) next.delete(i);
              return next;
            });
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENT }, worker));
    });
  }

  const states = [...progress.values()];
  const done = states.filter((s) => s.state === "done").length;
  const manual = states.filter((s) => s.state === "manual").length;
  const errored = states.filter((s) => s.state === "error").length;
  const allFinished =
    files.length > 0 && !pending && done + manual + errored === progress.size;

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

      {quotaHit ? (
        <div
          className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Daily scan limit reached — the rest of this batch was left alone.
            Pick them again tomorrow and they&apos;ll go through.
          </span>
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="max-h-72 overflow-auto rounded-md border border-border bg-muted/20 p-3">
          <ul className="space-y-1.5 text-sm">
            {files.map((f, i) => {
              const state = progress.get(i);
              return (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {f.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {state?.state === "error" ? (
                      <span className="text-xs text-destructive">{state.reason}</span>
                    ) : state?.state === "manual" ? (
                      <span className="text-xs text-muted-foreground">Needs your input</span>
                    ) : null}
                    <StateIcon state={state} />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {allFinished ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary/10 p-3 text-sm">
          <span>
            Done. {done} read automatically
            {manual > 0 ? `, ${manual} need filling in by hand` : ""}
            {errored > 0 ? `, ${errored} failed` : ""}.
          </span>
          <Button asChild size="sm">
            <Link href="/app/capture">Review confirm cards</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function buildForm(file: File) {
  const form = new FormData();
  form.append("file", file);
  form.append("source", "screenshot");
  return form;
}

function StateIcon({ state }: { state: FileState | undefined }) {
  if (!state) return <span className="text-xs text-muted-foreground">Not tried</span>;
  const className = cn(
    "h-4 w-4",
    state.state === "done" && "text-secondary",
    state.state === "manual" && "text-muted-foreground",
    state.state === "error" && "text-destructive",
    state.state === "pending" && "text-muted-foreground",
  );
  if (state.state === "done") return <CheckCircle2 className={className} />;
  if (state.state === "manual") return <AlertTriangle className={className} />;
  if (state.state === "error") return <XCircle className={className} />;
  return <Loader2 className={cn(className, "animate-spin")} />;
}
