"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, Camera, CheckCircle2, Keyboard, RefreshCw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { classifyScanOutcome, type ScanOutcome } from "@/lib/tickets/scan-state";

import { checkInTicket } from "./actions";

/**
 * The door. Camera scanning where the browser has BarcodeDetector (Chrome on
 * Android and desktop); a big code field everywhere else, including the iOS
 * WebView, where the five-and-five code is typed off the screen. Each result
 * stays on screen with a colour you can see from a metre away.
 *
 * Three colours, not two. Green is in, red is a definite no, and amber means
 * the server could not be reached: that is not a verdict on the ticket, so
 * the panel offers a retry of the same code instead of turning a paying fan
 * away. The server's valid→used update is atomic, so a retry after a scan
 * that did land comes back "already used" with the first scan's time.
 */
export function Scanner({ eventId, eventTitle }: { eventId: string; eventTitle: string }) {
  const [code, setCode] = useState("");
  const [log, setLog] = useState<Array<{ at: number; code: string; outcome: ScanOutcome }>>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [camSupported, setCamSupported] = useState(false);
  const [pending, start] = useTransition();
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  useEffect(() => {
    setCamSupported(typeof window !== "undefined" && "BarcodeDetector" in window);
  }, []);

  function submit(raw: string, opts: { force?: boolean } = {}) {
    const c = raw.trim();
    if (!c || pending) return;
    // Debounce the same code from a camera that keeps seeing it. A deliberate
    // retry after an uncertain result bypasses this.
    if (!opts.force && lastRef.current.code === c && Date.now() - lastRef.current.at < 4000) return;
    lastRef.current = { code: c, at: Date.now() };
    start(async () => {
      let outcome: ScanOutcome;
      try {
        outcome = classifyScanOutcome(await checkInTicket(eventId, c));
      } catch (e) {
        // A throw is a connection or server problem (Next masks the message in
        // production), never "not a ticket".
        outcome = classifyScanOutcome(e);
        console.error(e);
      }
      setLog((l) => [{ at: Date.now(), code: c, outcome }, ...l].slice(0, 30));
      setCode("");
    });
  }

  useEffect(() => {
    if (!cameraOn || !camSupported) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stop = false;
    const Detector = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
    const detector = new Detector({ formats: ["qr_code"] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const tick = async () => {
          if (stop || !videoRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            if (found[0]?.rawValue) submit(found[0].rawValue);
          } catch {
            /* frame not ready */
          }
          raf = window.setTimeout(tick, 350);
        };
        tick();
      } catch {
        setCameraOn(false);
      }
    })();
    return () => {
      stop = true;
      clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn, camSupported]);

  const latest = log[0];
  const tone =
    latest?.outcome.tone === "green"
      ? "bg-emerald-600 text-white"
      : latest?.outcome.tone === "amber"
        ? "bg-amber-500 text-black"
        : "bg-red-600 text-white";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Scanning for <strong className="text-foreground">{eventTitle}</strong></p>

      {latest ? (
        <div role="status" aria-live="polite" className={`rounded-xl p-5 text-center ${tone}`}>
          {latest.outcome.tone === "green" ? (
            <CheckCircle2 className="mx-auto h-12 w-12" />
          ) : latest.outcome.tone === "amber" ? (
            <AlertTriangle className="mx-auto h-12 w-12" />
          ) : (
            <XCircle className="mx-auto h-12 w-12" />
          )}
          <p className="mt-2 text-2xl font-bold">{latest.outcome.headline}</p>
          <p className="mt-1 text-sm opacity-90">{latest.outcome.detail}</p>
          <p className="mt-1 font-mono text-xs opacity-80">{latest.code}</p>
          {latest.outcome.retry ? (
            <Button
              type="button"
              variant="outline"
              className="mt-3 min-h-[44px] border-black/30 bg-white/80 text-black hover:bg-white"
              disabled={pending}
              onClick={() => submit(latest.code, { force: true })}
            >
              <RefreshCw /> Retry this code
            </Button>
          ) : null}
        </div>
      ) : null}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(code);
        }}
      >
        <Input
          aria-label="Ticket code"
          placeholder="GT-XXXXX-XXXXX-XXXXXX"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
          className="h-12 font-mono text-base"
        />
        <Button type="submit" className="h-12" disabled={pending || !code.trim()}>
          <Keyboard /> Check in
        </Button>
      </form>

      {camSupported ? (
        <div className="space-y-2">
          <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setCameraOn((v) => !v)}>
            <Camera /> {cameraOn ? "Stop camera" : "Scan with camera"}
          </Button>
          {cameraOn ? <video ref={videoRef} className="w-full rounded-xl bg-black" muted playsInline /> : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Camera scanning works in Chrome on Android and on desktop. This browser has no camera scanner, so type the code shown under the fan&apos;s QR: that is how iPhone works the door.
        </p>
      )}

      {log.length > 1 ? (
        <ul className="divide-y divide-border text-sm">
          {log.slice(1, 12).map((l) => (
            <li key={l.at} className="flex items-center justify-between py-1.5">
              <span className="font-mono text-xs">{l.code}</span>
              <span
                className={
                  l.outcome.tone === "green"
                    ? "text-emerald-500"
                    : l.outcome.tone === "amber"
                      ? "text-amber-500"
                      : "text-red-500"
                }
              >
                {l.outcome.state === "admitted" ? "in" : l.outcome.state.replace("_", " ")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
