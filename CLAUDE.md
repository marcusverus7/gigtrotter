# GigTrotter — project rules

## Cross-platform parity (web / iOS / Android)

**Rule: anything shipped must reach web, iOS, and Android together and behave the
same. No platform-exclusive features by default.**

This is the default state of the architecture, not extra work: there is **one
codebase — the Next.js web app**. The iOS and Android apps are **Capacitor shells
that load the live site** (`https://gigtrotter.vercel.app`) in a web view. So a
web deploy ships to all three platforms at once, and they stay identical for free.

When building or reviewing a feature:

- Build it once in the web app; do **not** add a feature only one platform can use.
- Confirm it relies only on standard web APIs the in-app web view can run (no
  desktop-only / browser-extension-only APIs).
- A change that needs a **native plugin or a new app capability** (camera plugin,
  push, biometrics, IAP, offline storage) requires a **new native build**, not
  just a web deploy — call that out explicitly when proposing it.

### Necessary exceptions (policy/capability-driven — must be deliberate + documented)

These cannot be byte-identical across platforms because the app stores or the OS
require it. The *feature and price* stay equivalent; only the *mechanism* differs:

1. **Payments / subscriptions.** GigTrotter+ and any digital purchase must use
   **Apple In-App Purchase (StoreKit)** on iOS and **Google Play Billing** on
   Android; the web may use Stripe. Mirroring web Stripe inside the iOS/Android
   apps violates store policy. Keep the offering and price equivalent.
2. **Apple Guideline 4.2 (minimum functionality).** A pure web-mirror app can be
   rejected as "just a website." The iOS app should keep at least one genuine
   native capability (e.g. camera capture, push notifications) so it clears 4.2.
   Being *too* identical to the website is itself a rejection risk.
3. **Offline ticket / barcode display** is intentionally native-only; the web
   shows a placeholder (barcodes must not leak through the share surface).
4. **External links & payment steering.** "Get tickets" / affiliate outbound
   links and any external-payment steering must respect Apple/Google anti-steering
   rules on iOS/Android, which can differ from the web.

If a feature can't satisfy the parity rule without hitting one of these, **stop and
flag it** rather than silently shipping a platform-only behaviour.
