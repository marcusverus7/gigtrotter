/**
 * Offline tests for the two door-facing truths (brief ENTRY-01 / ENTRY-02):
 *
 *   - entryInstructions(): what the night card says about getting in, for a
 *     static issuer, a rotating one, an app-locked one, a known forwarder and
 *     a seller nobody recognises. No barcode is ever described as scannable
 *     unless the issuer's own is static — and even then it points at the
 *     original, never at anything GigTrotter drew.
 *   - classifyScanOutcome(): every server verdict keeps its colour, and any
 *     throw (network, server, masked server-action error) is amber and
 *     retryable, never red.
 *
 * Run: pnpm exec tsx --tsconfig eval/tsconfig.json eval/entry.test.ts
 */

import { classifyIssuer, entryInstructions } from "../src/lib/tickets/issuer";
import { classifyScanOutcome } from "../src/lib/tickets/scan-state";

let passed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed += 1;
  } else {
    failures.push(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/* ── entryInstructions ───────────────────────────────────────────────────── */

function testEntryInstructions() {
  // 1) static issuer: the original ticket's barcode scans — open it there
  const sk = entryInstructions(classifyIssuer("skiddle"));
  check("static: heading names the issuer", sk.heading === "Your ticket is with Skiddle", sk.heading);
  check("static: body sends them to the original", /original e-ticket, PDF or confirmation email/.test(sk.body), sk.body);
  check("static: body says GigTrotter does not hold the barcode", /keeps the details, not the barcode/.test(sk.body));
  check("static: cta opens the issuer", sk.cta === "Open my Skiddle ticket" && sk.url === "https://www.skiddle.com/orders/", `${sk.cta} ${sk.url}`);

  // 2) rotating issuer: screenshots don't scan, open the app
  const tm = entryInstructions(classifyIssuer("ticketmaster"));
  check("rotating: heading tells them to open the app", tm.heading === "Open the Ticketmaster app at the door", tm.heading);
  check("rotating: body keeps the screenshot warning", /screenshots don't scan/i.test(tm.body), tm.body);
  check("rotating: cta opens the app", tm.cta === "Open in Ticketmaster" && !!tm.url);

  // 3) app-locked issuer: the QR only exists in the app, shortly before doors
  const dice = entryInstructions(classifyIssuer("dice"));
  check("app_locked: heading names the app", dice.heading === "Your code is in the DICE app", dice.heading);
  check("app_locked: body says only in its app", /only in its app/i.test(dice.body), dice.body);
  check("app_locked: cta opens the app", dice.cta === "Open in DICE" && dice.url === "https://dice.fm/account/tickets");

  // 4) known forwarder with unknown entry mode (Twickets resends the original)
  const tw = entryInstructions(classifyIssuer("twickets"));
  check("forwarder: heading says it came through Twickets", tw.heading === "Your ticket came through Twickets", tw.heading);
  check("forwarder: body tells them to check the original issuer", /original issuer/i.test(tw.body), tw.body);
  check("forwarder: cta opens Twickets", tw.cta === "Open Twickets" && !!tw.url);

  // 5) nobody recognises the seller: honest fallback, no button to nowhere
  const unk = entryInstructions(classifyIssuer("some-local-box-office"));
  check("unknown: heading is the seller", unk.heading === "Your ticket is with the seller", unk.heading);
  check("unknown: body admits GigTrotter does not hold the barcode", /does not hold this barcode/i.test(unk.body), unk.body);
  check("unknown: body gives the inbox route", /search your inbox/i.test(unk.body));
  check("unknown: no cta, no url", unk.cta === null && unk.url === null);

  // Nothing is ever told that a GigTrotter-drawn barcode scans.
  for (const [k, e] of [["skiddle", sk], ["ticketmaster", tm], ["dice", dice], ["twickets", tw], ["unknown", unk]] as const) {
    check(`${k}: never claims a captured/drawn barcode scans`, !/captured barcode|this barcode scans|shown here/i.test(`${e.heading} ${e.body}`));
  }
  // The same text comes out when the vendor is unknown but the ticket text names the issuer.
  const hinted = entryInstructions(classifyIssuer(null, ["Order #123 Eventbrite e-ticket"]));
  check("text hints resolve the issuer", hinted.heading === "Your ticket is with Eventbrite", hinted.heading);
}

/* ── classifyScanOutcome ─────────────────────────────────────────────────── */

function testScanOutcomes() {
  const ok = classifyScanOutcome({ ok: true, title: "Gig", tier: "General", owner: "@ann", usedAt: "2026-11-16T20:00:00Z" });
  check("valid: admitted, green, no retry", ok.state === "admitted" && ok.tone === "green" && ok.headline === "IN" && !ok.retry);
  check("valid: detail shows tier and owner", ok.detail === "General · @ann", ok.detail);

  const used = classifyScanOutcome({ ok: false, reason: "used", usedAt: "2026-11-16T20:00:00Z", title: "Gig" });
  check("used: red, headline ALREADY USED", used.state === "used" && used.tone === "red" && used.headline === "ALREADY USED" && !used.retry);
  check("used: detail carries the first scan time", /Scanned in at \d/.test(used.detail), used.detail);
  const own = classifyScanOutcome({ ok: false, reason: "used", usedAt: "2026-11-16T20:00:00Z", ownScan: true });
  check("used by own retry: amber ALREADY IN, no retry button", own.state === "used" && own.tone === "amber" && own.headline === "ALREADY IN" && /Not a second entry/.test(own.detail) && !own.retry, own.detail);
  const usedNoTime = classifyScanOutcome({ ok: false, reason: "used" });
  check("used without time: still says earlier", usedNoTime.detail === "Scanned in earlier", usedNoTime.detail);

  const wrong = classifyScanOutcome({ ok: false, reason: "wrong_event", title: "Other night" });
  check("wrong_event: red, names the other event", wrong.state === "wrong_event" && wrong.tone === "red" && /Other night/.test(wrong.detail) && !wrong.retry);

  const unknown = classifyScanOutcome({ ok: false, reason: "unknown" });
  check("unknown: not_found, red", unknown.state === "not_found" && unknown.tone === "red" && unknown.headline === "NOT FOUND" && !unknown.retry);

  const voided = classifyScanOutcome({ ok: false, reason: "void", title: "Gig" });
  check("void: CANCELLED, red", voided.state === "void" && voided.tone === "red" && voided.headline === "CANCELLED" && !voided.retry);

  const forbidden = classifyScanOutcome({ ok: false, reason: "forbidden" });
  check("forbidden: NO DOOR ACCESS, red, not retryable", forbidden.state === "forbidden" && forbidden.tone === "red" && forbidden.headline === "NO DOOR ACCESS" && !forbidden.retry);
  check("forbidden: tells them who can fix it", /promoter/i.test(forbidden.detail), forbidden.detail);

  const invalid = classifyScanOutcome({ ok: false, reason: "invalid" });
  check("invalid: NOT A TICKET, red", invalid.state === "not_a_ticket" && invalid.tone === "red" && invalid.headline === "NOT A TICKET" && !invalid.retry);

  // Throws: a dropped connection (fetch rejects with TypeError)…
  const net = classifyScanOutcome(new TypeError("Failed to fetch"));
  check("thrown TypeError: uncertain, amber, retryable", net.state === "uncertain" && net.tone === "amber" && net.retry);
  check("thrown TypeError: never says not a ticket", !/NOT A TICKET|NOT FOUND/.test(net.headline) && /retry/i.test(net.detail), `${net.headline} / ${net.detail}`);
  // …a generic server error…
  const generic = classifyScanOutcome(new Error("An error occurred in the Server Components render."));
  check("thrown Error: uncertain, amber, retryable", generic.state === "uncertain" && generic.tone === "amber" && generic.retry);
  // …and the garbage shapes a masked production error can arrive as.
  for (const junk of [undefined, null, "boom", 42, {}, { ok: "yes" }, { reason: "used" }]) {
    const o = classifyScanOutcome(junk);
    check(`non-result ${JSON.stringify(junk) ?? "undefined"}: uncertain`, o.state === "uncertain" && o.tone === "amber" && o.retry);
  }
  // Red is reserved for definite server verdicts; amber never shares a headline with them.
  const reds = ["used", "wrong_event", "unknown", "void", "forbidden", "invalid"] as const;
  check(
    "only server verdicts are red",
    reds.every((r) => classifyScanOutcome({ ok: false, reason: r }).tone === "red") && classifyScanOutcome(new Error("x")).tone !== "red",
  );
}

/* ── report ─────────────────────────────────────────────────────────────── */

testEntryInstructions();
testScanOutcomes();
const total = passed + failures.length;
console.log(`entry tests: ${passed}/${total} passed`);
for (const f of failures) console.error(f);
if (failures.length > 0) process.exit(1);
