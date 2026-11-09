"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/**
 * False during the server render and the hydration pass, true after. Text
 * that depends on the browser's locale, time zone or clock must wait for
 * this: the server renders in en-US and UTC, and React does NOT patch
 * mismatched text during hydration — suppressHydrationWarning only hides the
 * warning, so the server's UTC string stays on screen. Without the warning
 * suppressed, the mismatch makes React throw the page's HTML away (#418).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}
