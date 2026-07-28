"""
Generate the GigTrotter app icon (1024x1024) matching the brand glyph in brand.tsx:
  - Slate-950 background (#020617)
  - Violet gradient ticket-stub with map pin rising from top
Writes:  ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
"""
import math
from PIL import Image, ImageDraw

SIZE = 1024
SCALE = 19          # SVG viewBox 32x40 → 608x760 px  (≈60% / 74% of icon)
X_OFF = (SIZE - 32 * SCALE) / 2   # 208
Y_OFF = (SIZE - 40 * SCALE) / 2   # 132

BG = (2, 6, 23)           # #020617  slate-950
VIO_TOP = (167, 139, 250) # #a78bfa  violet-400  (lighter, top of gradient)
VIO_BOT = (109,  40, 217) # #6d28d9  violet-700  (deeper, bottom)


def px(svgx, svgy):
    return (X_OFF + svgx * SCALE, Y_OFF + svgy * SCALE)


def pr(r):
    return r * SCALE


# ── vertical gradient band (same height as full icon) ─────────────────────
gradient = Image.new("RGB", (SIZE, SIZE))
for y in range(SIZE):
    t = y / (SIZE - 1)
    r = round(VIO_TOP[0] * (1 - t) + VIO_BOT[0] * t)
    g = round(VIO_TOP[1] * (1 - t) + VIO_BOT[1] * t)
    b = round(VIO_TOP[2] * (1 - t) + VIO_BOT[2] * t)
    gradient.paste((r, g, b), (0, y, SIZE, y + 1))

# ── mask: all violet shapes in white ──────────────────────────────────────
mask = Image.new("L", (SIZE, SIZE), 0)
md = ImageDraw.Draw(mask)

# Map-pin body: circle (cx=16, cy=8, r=8)
pcx, pcy = px(16, 8)
pr8 = pr(8)
md.ellipse([pcx - pr8, pcy - pr8, pcx + pr8, pcy + pr8], fill=255)

# Map-pin tip: downward triangle  [(8,8) → (16,21) → (24,8)]
md.polygon([px(8, 8), px(16, 21), px(24, 8)], fill=255)

# Ticket body: rounded rect (x=6, y=19, w=20, h=18, rx=3)
tx1, ty1 = px(6, 19)
tx2, ty2 = px(26, 37)
md.rounded_rectangle([tx1, ty1, tx2, ty2], radius=pr(3), fill=255)

# ── composite gradient onto background ────────────────────────────────────
bg_img = Image.new("RGB", (SIZE, SIZE), BG)
img = Image.composite(gradient, bg_img, mask)

# ── dark cut-outs drawn on top ─────────────────────────────────────────────
d = ImageDraw.Draw(img)

# Pin inner ring (dark, cx=16, cy=8, r=3.2)
d.ellipse(
    [pcx - pr(3.2), pcy - pr(3.2), pcx + pr(3.2), pcy + pr(3.2)],
    fill=BG,
)
# Pin inner dot (violet, r=1.4) — use mid-gradient colour
mid_vio = tuple(round((VIO_TOP[i] + VIO_BOT[i]) / 2) for i in range(3))
d.ellipse(
    [pcx - pr(1.4), pcy - pr(1.4), pcx + pr(1.4), pcy + pr(1.4)],
    fill=mid_vio,
)

# Notch cut-outs on ticket sides (cx=6, cy=26 and cx=26, cy=26, r=2.5)
for notch_x in (6, 26):
    ncx, ncy = px(notch_x, 26)
    nr = pr(2.5)
    d.ellipse([ncx - nr, ncy - nr, ncx + nr, ncy + nr], fill=BG)

# Detail lines on ticket (y=25 and y=29, x=11..21, h=1.6)
line_col = (max(0, BG[0] + 20), max(0, BG[1] + 20), max(0, BG[2] + 20))
for line_y in (25, 29):
    lx1, ly1 = px(11, line_y)
    lx2, ly2 = px(21, line_y + 1.6)
    d.rounded_rectangle([lx1, ly1, lx2, ly2], radius=pr(0.8), fill=line_col)

# ── save ──────────────────────────────────────────────────────────────────
out = r"ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png"
img.save(out, "PNG")
print(f"Saved {SIZE}x{SIZE} icon -> {out}")
img.save("icon_preview.png", "PNG")
print("Preview saved -> icon_preview.png")
