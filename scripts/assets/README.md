# Asset generators

Scripts that produce GigTrotter's branded native assets and store screenshots.
They are tracked because their **outputs** are committed binaries — without the
script, regenerating a matching icon means eyeballing it.

Requires Pillow (`pip install pillow`). Windows-friendly: they resolve fonts from
`C:\Windows\Fonts` with Linux fallbacks.

| Script | Produces | Goes to |
|---|---|---|
| `make_icon.py` | 1024×1024 app icon — slate-950 ground, violet ticket + map pin | `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` |
| `make_splash.py` | 2732×2732 splash, ×3 variants — glyph + "GigTrotter" wordmark | `ios/App/App/Assets.xcassets/Splash.imageset/` |
| `generate-appstore-screenshots.py` | App Store listing screenshots | `appstore-screenshots/` (gitignored) |

The glyph is drawn to match `GigTrotterGlyph` in `src/components/brand.tsx` —
same violet-400 → violet-700 gradient on `#020617`. **If the in-app glyph
changes, these must be re-run**, or the icon on the home screen drifts from the
mark inside the app.

Both write straight into `Assets.xcassets`, so committing their output triggers
`ios-build.yml` (it watches that path) and the next TestFlight build carries the
new artwork. Note native assets only reach a device via a **new binary** — unlike
web changes, which the Capacitor shell picks up from the live site.
