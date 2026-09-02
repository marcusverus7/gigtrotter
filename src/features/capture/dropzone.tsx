"use client";

import { useRef, useState, useTransition } from "react";
import { UploadCloud, Loader2, Camera } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";


/**
 * The headline MVP surface (§8.1 "Smart screenshot import"). Drag-drop, click,
 * or paste — all three are first-class. We surface the confirm card inline
 * after parse so the user sees the trust signal: every capture is editable.
 */
export function CaptureDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    const file = Array.from(files).find((f) => f.type.startsWith("image/"));
    if (!file) {
      setError("Please drop an image (PNG, JPG, or WebP).");
      return;
    }
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("source", "screenshot");
    startTransition(async () => {
      let res: Response;
      try {
        res = await fetch("/api/captures", { method: "POST", body: form });
      } catch {
        // fetch itself rejecting means the request never arrived — on a phone
        // that is usually just signal. Without this catch the spinner ended
        // and the page said nothing.
        setError("Couldn't reach the server — check your connection and try again.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Couldn't read this one.");
        return;
      }
      // Don't render an inline card here: router.refresh() re-renders
      // <PendingCaptures/> below, which lists this capture — an inline copy
      // produced TWO confirm cards for one capture (tester-reported).
      await res.json().catch(() => null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onPaste={(e) => {
          const items = e.clipboardData?.items;
          if (!items) return;
          for (let i = 0; i < items.length; i++) {
            const f = items[i].getAsFile();
            if (f) {
              handleFiles([f]);
              break;
            }
          }
        }}
        className={cn(
          "block cursor-pointer rounded-xl border-2 border-dashed border-border bg-card/40 p-10 text-center transition-colors hover:border-primary/60 hover:bg-card/70",
          dragging && "border-primary bg-card",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple={false}
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          capture="environment"
          multiple={false}
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="flex flex-col items-center gap-3">
          {pending ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          ) : (
            <UploadCloud className="h-8 w-8 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm font-medium">
              {pending ? "Reading it…" : "Drop a ticket, boarding pass, or booking"}
            </p>
            <p className="text-xs text-muted-foreground">
              Or click to pick, or paste from the clipboard.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={pending}
            >
              Choose file
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => cameraInputRef.current?.click()}
              disabled={pending}
            >
              <Camera className="h-4 w-4" />
              Take photo
            </Button>
          </div>
        </div>
      </label>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

    </div>
  );
}
