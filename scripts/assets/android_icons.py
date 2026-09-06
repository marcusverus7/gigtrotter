"""
Brand the generated Android project with GigTrotter's launcher icon and splash.

The `android/` project is not committed — CI regenerates it with `npx cap add
android`, which scaffolds Capacitor's default green placeholder icon. This
script overwrites that placeholder using the SAME committed source art the iOS
build uses, so both stores show the same mark:

  ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png  (1024x1024)
  ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png   (2732x2732)

It writes only into `android/app/src/main/res/`, which is gitignored, so running
it locally leaves the repo clean.

  python3 scripts/assets/android_icons.py [--android-dir android]

Requires Pillow (`pip install pillow`).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[2]

ICON_SRC = REPO / "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
SPLASH_SRC = REPO / "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png"

# Slate-950 — the icon's ground colour, reused as the adaptive-icon background
# and the splash window background so there is no flash of a different colour.
BG = (2, 6, 23)
BG_HEX = "#020617"

# Adaptive icons are 108dp with only the centre 66dp guaranteed visible. Keep
# the glyph inside that safe zone or launchers that use a circular mask crop it.
SAFE_ZONE = 0.58

# Density buckets -> legacy launcher icon size in px (48dp baseline).
LEGACY_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
# Same buckets at the 108dp adaptive-icon canvas size.
ADAPTIVE_SIZES = {name: round(px * 108 / 48) for name, px in LEGACY_SIZES.items()}


def load(path: Path) -> Image.Image:
    if not path.is_file():
        sys.exit(f"error: source art missing: {path}")
    return Image.open(path).convert("RGBA")


def key_out_background(icon: Image.Image, tolerance: int = 90) -> Image.Image:
    """Return the glyph alone, with the flat slate ground knocked out.

    The icon is a violet glyph on a single flat colour, so a distance key is
    exact rather than approximate; the ramp keeps the antialiased edge smooth.
    """
    icon = icon.convert("RGB")
    alpha = Image.new("L", icon.size)
    px_in = icon.load()
    px_out = alpha.load()
    for y in range(icon.height):
        for x in range(icon.width):
            r, g, b = px_in[x, y]
            dist = abs(r - BG[0]) + abs(g - BG[1]) + abs(b - BG[2])
            px_out[x, y] = 255 if dist >= tolerance else round(dist / tolerance * 255)
    out = icon.convert("RGBA")
    out.putalpha(alpha)
    return out.crop(out.getbbox() or (0, 0, icon.width, icon.height))


def circular(icon: Image.Image, size: int) -> Image.Image:
    """Legacy round icon: the full square icon behind a circular mask."""
    base = icon.resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    base.putalpha(mask.resize((size, size), Image.LANCZOS))
    return base


def adaptive_foreground(glyph: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    target = round(size * SAFE_ZONE)
    scale = target / max(glyph.width, glyph.height)
    scaled = glyph.resize(
        (max(1, round(glyph.width * scale)), max(1, round(glyph.height * scale))),
        Image.LANCZOS,
    )
    canvas.paste(
        scaled,
        ((size - scaled.width) // 2, (size - scaled.height) // 2),
        scaled,
    )
    return canvas


def cover(src: Image.Image, width: int, height: int) -> Image.Image:
    """Resize preserving aspect ratio and centre-crop to exactly width x height."""
    scale = max(width / src.width, height / src.height)
    resized = src.resize(
        (max(1, round(src.width * scale)), max(1, round(src.height * scale))),
        Image.LANCZOS,
    )
    left = (resized.width - width) // 2
    top = (resized.height - height) // 2
    return resized.crop((left, top, left + width, top + height))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--android-dir", default="android")
    args = parser.parse_args()

    res = (REPO / args.android_dir / "app/src/main/res").resolve()
    if not res.is_dir():
        sys.exit(
            f"error: {res} not found — run `npx cap add android` before this script."
        )

    icon = load(ICON_SRC)
    glyph = key_out_background(icon)
    written: list[str] = []

    for bucket, size in LEGACY_SIZES.items():
        folder = res / bucket
        folder.mkdir(parents=True, exist_ok=True)

        icon.resize((size, size), Image.LANCZOS).save(folder / "ic_launcher.png")
        circular(icon, size).save(folder / "ic_launcher_round.png")

        fg_size = ADAPTIVE_SIZES[bucket]
        adaptive_foreground(glyph, fg_size).save(folder / "ic_launcher_foreground.png")
        # Some Capacitor templates ship a bitmap background layer too; if it is
        # there, keep it in step with the colour resource below.
        bg_layer = folder / "ic_launcher_background.png"
        if bg_layer.exists():
            Image.new("RGBA", (fg_size, fg_size), (*BG, 255)).save(bg_layer)
        written.append(f"{bucket}: ic_launcher {size}px, foreground {fg_size}px")

    # The adaptive-icon XML references this colour for its background layer.
    values = res / "values"
    values.mkdir(parents=True, exist_ok=True)
    (values / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        f'    <color name="ic_launcher_background">{BG_HEX}</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )
    written.append("values/ic_launcher_background.xml")

    # Splash: replace every splash bitmap the template scaffolded, matching each
    # file's existing dimensions so portrait/landscape buckets stay correct.
    splash = load(SPLASH_SRC)
    splash_files = sorted(res.glob("drawable*/splash.png"))
    if not splash_files:
        # Older/newer templates may not ship one; create the density-independent
        # default so the shell still shows brand art rather than white.
        default = res / "drawable"
        default.mkdir(parents=True, exist_ok=True)
        splash_files = [default / "splash.png"]
        cover(splash, 1920, 1920).save(splash_files[0])
        written.append("drawable/splash.png (created 1920x1920)")
    else:
        for path in splash_files:
            with Image.open(path) as existing:
                width, height = existing.size
            cover(splash, width, height).save(path)
            written.append(f"{path.relative_to(res)} ({width}x{height})")

    print("Branded Android resources:")
    for line in written:
        print(f"  - {line}")


if __name__ == "__main__":
    main()
