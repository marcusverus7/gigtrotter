# Parse corpus

Per §14 pre-build checklist: **the single highest-leverage prep task in v3**.

Drop 50+ real ticket / boarding pass / booking screenshots into this directory, structured by vendor:

```
eval/captures/
  ticketmaster/
    glastonbury-2026.png
    fontaines-ally-pally.jpg
  ryanair/
    dub-stn-2026-04.png
  easyjet/
  booking/
  airbnb/
  dice/
  eventbrite/
  edge-cases/        # PDFs, weird crops, multi-ticket
```

Then run:

```bash
pnpm tsx eval/run.ts   # to be implemented in Phase 2 polish
```

It runs each through the live parser, prints accuracy per field, and writes a markdown report into `eval/reports/<datestamp>.md`. This is your week-two go/no-go signal: parsing reliability is the bet.

**Tracked-but-empty:** `.gitkeep` keeps the folder; screenshots themselves are gitignored — they contain PII.
