"use client";

import { useState, useTransition } from "react";
import { Crosshair } from "lucide-react";

import { Button } from "@/components/ui/button";

import { confirmAttendanceByGeo } from "./geofence-actions";

/**
 * "I'm here" button. Opt-in only — the client requests geolocation, and the
 * server uses the coordinate just long enough to match a wallet item then
 * discards it (we never persist raw lat/lng per the privacy promise).
 */
export function GeofenceCheckInButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function checkIn() {
    setMessage(null);
    if (!("geolocation" in navigator)) {
      setMessage("Your browser doesn't support geolocation.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        startTransition(async () => {
          try {
            const result = await confirmAttendanceByGeo({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy_m: Math.min(2000, Math.round(pos.coords.accuracy)),
              capturedAt: new Date(pos.timestamp).toISOString(),
            });
            if (result.matched > 0) {
              setMessage("Verified ✓ — your pin is on the map.");
            } else {
              setMessage("Nothing matched here. No tonight items at this venue.");
            }
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : "Could not check in.",
            );
          }
        });
      },
      (err) => {
        setMessage(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. No worries — toggle later."
            : "Couldn't read your location.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={checkIn}
        disabled={pending}
        className="w-full"
      >
        <Crosshair /> {pending ? "Checking…" : "I'm here — verify attendance"}
      </Button>
      {message ? (
        <p className="text-center text-xs text-muted-foreground">{message}</p>
      ) : null}
      <p className="text-center text-[10px] text-muted-foreground/60">
        Your location matches a venue and is then discarded — never stored.
      </p>
    </div>
  );
}
