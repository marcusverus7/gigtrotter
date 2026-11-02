/**
 * Which ticket issuer is this, and will a captured barcode actually scan?
 *
 * The wallet thesis quietly assumed a screenshot of a ticket IS the ticket.
 * For the two biggest UK issuers it is not: Ticketmaster SafeTix rotates the
 * barcode every ~15 seconds and AXS Mobile ID every ~60, so a screenshot
 * shows a code that expired before the user reached the door; DICE does not
 * show a QR at all until shortly before doors, and only inside its app. A
 * night-mode card that renders the captured barcode for those issuers sends
 * people to the gate with something that will be refused.
 *
 * So night mode asks this module first. Static issuers (PDF / e-ticket
 * barcodes) get the barcode; rotating and app-locked issuers get a one-tap
 * link into the issuer's app, where the real code lives, and a plain
 * sentence saying why. Pure — tested in eval/logic.test.ts.
 */

export type EntryMode = "static" | "rotating" | "app_locked" | "unknown";

export type IssuerInfo = {
  /** Canonical issuer key, or null when nothing recognisable was captured. */
  issuer: string | null;
  /** Human name for buttons: "Ticketmaster", "DICE". */
  label: string | null;
  entryMode: EntryMode;
  /** Where the live ticket lives. A universal link opens the app when installed. */
  openUrl: string | null;
  /** One sentence for the card. */
  advice: string;
};

type Known = { label: string; entryMode: EntryMode; openUrl: string; advice: string };

const KNOWN: Record<string, Known> = {
  ticketmaster: {
    label: "Ticketmaster",
    entryMode: "rotating",
    openUrl: "https://www.ticketmaster.co.uk/member/tickets",
    advice: "Ticketmaster's barcode refreshes every few seconds — screenshots don't scan. Open the app at the door.",
  },
  axs: {
    label: "AXS",
    openUrl: "https://www.axs.com/my-account/tickets",
    entryMode: "rotating",
    advice: "AXS Mobile ID rotates its barcode — screenshots don't scan. Open the AXS app at the door.",
  },
  dice: {
    label: "DICE",
    entryMode: "app_locked",
    openUrl: "https://dice.fm/account/tickets",
    advice: "DICE shows your QR code only in its app, shortly before doors. Have it signed in.",
  },
  seetickets: {
    label: "See Tickets",
    entryMode: "static",
    openUrl: "https://www.seetickets.com/customerservice",
    advice: "See Tickets barcodes are static — the one on your ticket scans.",
  },
  skiddle: {
    label: "Skiddle",
    entryMode: "static",
    openUrl: "https://www.skiddle.com/orders/",
    advice: "Skiddle's RapidScan barcode is static — the one on your ticket scans.",
  },
  eventbrite: {
    label: "Eventbrite",
    entryMode: "static",
    openUrl: "https://www.eventbrite.co.uk/u/tickets/",
    advice: "Eventbrite tickets are static — the barcode on your ticket scans.",
  },
  gigantic: {
    label: "Gigantic",
    entryMode: "static",
    openUrl: "https://www.gigantic.com/account",
    advice: "Gigantic e-tickets are static — the barcode on your ticket scans.",
  },
  ticketweb: {
    label: "TicketWeb",
    entryMode: "static",
    openUrl: "https://www.ticketweb.uk/user/orders",
    advice: "TicketWeb barcodes are static — the one on your ticket scans.",
  },
  twickets: {
    label: "Twickets",
    entryMode: "unknown",
    openUrl: "https://www.twickets.live/en/account",
    advice: "Twickets resends the original issuer's ticket — check which app or email it came through.",
  },
  residentadvisor: {
    label: "Resident Advisor",
    entryMode: "app_locked",
    openUrl: "https://ra.co/tickets",
    advice: "RA releases the QR code in its app close to the event. Have it signed in.",
  },
};

const ALIASES: Record<string, string> = {
  tm: "ticketmaster",
  "ticketmaster.co.uk": "ticketmaster",
  "ticketmaster.ie": "ticketmaster",
  "see tickets": "seetickets",
  "see-tickets": "seetickets",
  ra: "residentadvisor",
  "resident advisor": "residentadvisor",
  "dice.fm": "dice",
};

function key(v: string): string {
  const t = v.trim().toLowerCase();
  return ALIASES[t] ?? t.replace(/[^a-z0-9]/g, "");
}

/** Recognise an issuer from the parser's vendor, falling back to text on the ticket. */
export function classifyIssuer(
  vendor: string | null | undefined,
  textHints: readonly string[] = [],
): IssuerInfo {
  let k = vendor ? key(vendor) : "";
  if (!k || !KNOWN[k]) {
    const hay = textHints.join(" ").toLowerCase();
    k =
      Object.keys(KNOWN).find((name) => hay.includes(KNOWN[name].label.toLowerCase())) ??
      Object.keys(ALIASES).find((a) => hay.includes(a))?.replace(/.*/, (a) => ALIASES[a]) ??
      "";
  }
  const known = KNOWN[k];
  if (!known) {
    return {
      issuer: vendor ? key(vendor) || null : null,
      label: null,
      entryMode: "unknown",
      openUrl: null,
      advice:
        "Have the ticket email or the seller's app ready at the door — some issuers only show the live barcode there.",
    };
  }
  return { issuer: k, ...known };
}

/** Does showing the captured barcode help at the door? */
export function barcodeScansAtDoor(info: IssuerInfo): boolean {
  return info.entryMode === "static";
}
