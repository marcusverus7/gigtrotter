"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, CheckCircle2, Keyboard, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { checkInTicket, type CheckInResult } from "./actions";

/**
 * The door. Camera scanning where the browser has BarcodeDetector (Android
 * Chrome, desktop Chrome); a big code field everywhere else, including the
 * iOS WebView, where typing the five-and-five code off the screen is fast
 * enough and never misreads. Each result stays on screen with a colour you
 * can see from a metre away.
 */
export function Scanner({ eventId, eventTitle }: { eventId: string; eventTitle: string }) {
  const [code, setCode] = useState("");
  const [log, setLog] = useState<Array<{ at: number; code: string; r: CheckInResult }>>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [camSupported, setCamSupported] = useState(false);
  const [pending, start] = useTransition();
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  useEffect(() => {
    setCamSupported(typeof window !== "undefined" && "BarcodeDetector" in window);
  }, []);

  function submit(raw: string) {
    const c = raw.trim();
    if (!c || pending) return;
    // Debounce the same code from a camera that keeps seeing it.
    if (lastRef.current.code === c && Date.now() - lastRef.current.at < 4000) return;
    lastRef.current = { code: c, at: Date.now() };
    start(async () => {
      try {
        const r = await checkInTicket(eventId, c);
        setLog((l) => [{ at: Date.now(), code: c, r }, ...l].slice(0, 30));
      } catch (e) {
        const r: CheckInResult = { ok: false, reason: "invalid" };
        setLog((l) => [{ at: Date.now(), code: c, r }, ...l].slice(0, 30));
        console.error(e);
      }
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
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Scanning for <strong className="text-foreground">{eventTitle}</strong></p>

      {latest ? (
        <div
          role="status"
          className={`rounded-xl p-5 text-center ${latest.r.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
        >
          {latest.r.ok ? <CheckCircle2 className="mx-auto h-12 w-12" /> : <XCircle className="mx-auto h-12 w-12" />}
          <p className="mt-2 text-2xl font-bold">
            {latest.r.ok
              ? "IN"
              : latest.r.reason === "used"
                ? "ALREADY USED"
                : latest.r.reason === "wrong_event"
                  ? "WRONG EVENT"
                  : latest.r.reason === "unknown"
                    ? "NOT FOUND"
                    : latest.r.reason === "void"
                      ? "CANCELLED"
                      : "NOT A TICKET"}
          </p>
          <p className="mt-1 text-sm opacity-90">
            {latest.r.ok ? [latest.r.tier, latest.r.owner].filter(Boolean).join(" · ") : latest.r.reason === "used" && latest.r.usedAt ? `Scanned at ${new Date(latest.r.usedAt).toLocaleTimeString()}` : latest.r.title ?? ""}
          </p>
          <p className="mt-1 font-mono text-xs opacity-80">{latest.code}</p>
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
          <Button type="button" variant="outline" onClick={() => setCameraOn((v) => !v)}>
            <Camera /> {cameraOn ? "Stop camera" : "Scan with camera"}
          </Button>
          {cameraOn ? <video ref={videoRef} className="w-full rounded-xl bg-black" muted playsInline /> : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Camera scanning needs Chrome on Android or desktop; on iPhone, type the code shown under the QR.</p>
      )}

      {log.length > 1 ? (
        <ul className="divide-y divide-border text-sm">
          {log.slice(1, 12).map((l) => (
            <li key={l.at} className="flex items-center justify-between py-1.5">
              <span className="font-mono text-xs">{l.code}</span>
              <span className={l.r.ok ? "text-emerald-500" : "text-red-500"}>{l.r.ok ? "in" : l.r.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
