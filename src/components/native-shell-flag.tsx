"use client";

import { useEffect } from "react";

/**
 * Marks <html data-native="true"> when running inside the Capacitor shell.
 *
 * Lets CSS distinguish "native WebView" from "mobile browser" — they need
 * different safe-area handling. In the shell the status bar is drawn over the
 * page and needs a padding floor; in a browser the chrome sits above the page
 * and the same padding would just waste space. Capacitor injects its bridge
 * even when loading a remote URL, so this works on the deployed site.
 */
export function NativeShellFlag() {
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor;
    if (cap?.isNativePlatform?.()) {
      document.documentElement.setAttribute("data-native", "true");
    }
  }, []);
  return null;
}
