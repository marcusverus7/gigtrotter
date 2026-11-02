/**
 * What the door sees after a scan. PURE — tested in eval/entry.test.ts.
 *
 * The server answers with a definite result (in, already used, wrong event,
 * not found, cancelled, not a ticket, no door access) or the call throws.
 * A throw is NOT a verdict on the ticket: it is a dropped connection, a
 * server error, or (in production) a server-action error whose message Next
 * has masked. Showing red for that sends a paying fan away from the door, so
 * every throw maps to "uncertain": amber, with a retry that bypasses the
 * duplicate-scan debounce. The server's atomic valid→used update means a
 * retry after a scan that did land answers "already used" with the time of
 * the first scan, which the UI shows as the earlier admission, not a fraud.
 */

export type ScanServerResult =
  | { ok: true; title: string; tier: string | null; owner: string | null; usedAt: string }
  | {
      ok: false;
      reason: "invalid" | "unknown" | "used" | "wrong_event" | "void" | "forbidden";
      usedAt?: string | null;
      title?: string;
      /** "used" only: this same operator scanned it in within the last two minutes, i.e. a retry whose first attempt landed. */
      ownScan?: boolean;
    };

export type ScanState =
  | "admitted"
  | "used"
  | "wrong_event"
  | "not_found"
  | "void"
  | "not_a_ticket"
  | "forbidden"
  | "uncertain";

export type ScanOutcome = {
  state: ScanState;
  /** Big word on the panel. */
  headline: string;
  /** One line under it. */
  detail: string;
  tone: "green" | "red" | "amber";
  /** Offer a retry of the same code (bypassing the debounce). */
  retry: boolean;
};

function isResult(x: unknown): x is ScanServerResult {
  return typeof x === "object" && x !== null && typeof (x as { ok?: unknown }).ok === "boolean";
}

function timeOf(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString();
}

/**
 * Map a server result, or whatever the call threw, to what the door shows.
 * Anything that is not a well-formed result is treated as uncertain.
 */
export function classifyScanOutcome(resultOrError: unknown): ScanOutcome {
  if (!isResult(resultOrError)) {
    return {
      state: "uncertain",
      headline: "COULDN'T REACH THE SERVER",
      detail: "Not a verdict on the ticket. Check the connection and tap to retry the same code.",
      tone: "amber",
      retry: true,
    };
  }
  const r = resultOrError;
  if (r.ok) {
    return {
      state: "admitted",
      headline: "IN",
      detail: [r.tier, r.owner].filter(Boolean).join(" · "),
      tone: "green",
      retry: false,
    };
  }
  switch (r.reason) {
    case "used": {
      const at = timeOf(r.usedAt);
      if (r.ownScan) {
        // The first attempt landed and this is the same operator retrying
        // (lost response, double tap). The fan is in; nobody is being turned
        // away and nobody got in twice.
        return {
          state: "used",
          headline: "ALREADY IN",
          detail: at ? `Your scan at ${at} landed. Not a second entry.` : "Your earlier scan landed. Not a second entry.",
          tone: "amber",
          retry: false,
        };
      }
      return {
        state: "used",
        headline: "ALREADY USED",
        detail: at ? `Scanned in at ${at}` : "Scanned in earlier",
        tone: "red",
        retry: false,
      };
    }
    case "wrong_event":
      return {
        state: "wrong_event",
        headline: "WRONG EVENT",
        detail: r.title ? `This ticket is for ${r.title}` : "This ticket is for a different event",
        tone: "red",
        retry: false,
      };
    case "unknown":
      return {
        state: "not_found",
        headline: "NOT FOUND",
        detail: "A GigTrotter code that was never issued",
        tone: "red",
        retry: false,
      };
    case "void":
      return {
        state: "void",
        headline: "CANCELLED",
        detail: r.title ? `Refunded, transferred or voided · ${r.title}` : "Refunded, transferred or voided",
        tone: "red",
        retry: false,
      };
    case "forbidden":
      return {
        state: "forbidden",
        headline: "NO DOOR ACCESS",
        detail: "Your account is not on the door for this event. Ask the promoter to add you.",
        tone: "red",
        retry: false,
      };
    case "invalid":
    default:
      return {
        state: "not_a_ticket",
        headline: "NOT A TICKET",
        detail: "Not a GigTrotter code",
        tone: "red",
        retry: false,
      };
  }
}
