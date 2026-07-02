"use client";

import { useEffect, useState } from "react";

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

/**
 * Detects whether the web app is running inside the Capacitor iOS/Android shell
 * rather than a normal browser. Capacitor injects a `window.Capacitor` bridge
 * into the WebView even when it loads the remote production URL, so we can read
 * it on the client.
 *
 * Returns `{ isNativeApp: false, platform: "web" }` during SSR and the first
 * client render, then resolves after mount. Callers that gate store-sensitive
 * UI (e.g. external-payment steering) should therefore treat the web branch as
 * the default and only *remove* things once `isNativeApp` is true.
 */
export function useNativeApp() {
  const [state, setState] = useState<{ isNativeApp: boolean; platform: string }>(
    { isNativeApp: false, platform: "web" },
  );

  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
    setState({
      isNativeApp: cap?.isNativePlatform?.() ?? false,
      platform: cap?.getPlatform?.() ?? "web",
    });
  }, []);

  return state;
}
