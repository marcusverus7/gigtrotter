"""
Generate the GigTrotter splash screens (2732x2732) matching the brand.
Slate-950 background, violet gradient glyph + wordmark centered.
Writes all 3 splash PNG variants used by Capacitor iOS.
"""
import os
from PIL import Image, ImageDraw, ImageFont

SIZE = 2732
SCALE = 15           # glyph: 32*15=480w, 40*15=600h

# Center glyph slightly above true center (looks better on phone)
GLYPH_W = 32 * SCALE  # 480
GLYPH_H = 40 * SCALE  # 600
X_OFF = (SIZE - GLYPH_W) / 2       # 1126
Y_OFF = (SIZE - GLYPH_H) / 2 - 80  # slightly above center

BG      = (2,   6,  23)   # #020617
VIO_TOP = (167, 139, 250) # #a78bfa
VIO_BOT = (109,  40, 217) # #6d28d9


def px(svgx, svgy):
    return (X_OFF + svgx * SCALE, Y_OFF + svgy * SCALE)


def pr(r):
    return r * SCALE


def make_splash():
    # Vertical gradient band
    gradient = Image.new("RGB", (SIZE, SIZE))
    for y in range(SIZE):
        t = y / (SIZE - 1)
        r = round(VIO_TOP[0] * (1 - t) + VIO_BOT[0] * t)
        g = round(VIO_TOP[1] * (1 - t) + VIO_BOT[1] * t)
        b = round(VIO_TOP[2] * (1 - t) + VIO_BOT[2] * t)
        gradient.paste((r, g, b), (0, y, SIZE, y + 1))

    # Mask for violet shapes
    mask = Image.new("L", (SIZE, SIZE), 0)
    md = ImageDraw.Draw(mask)

    # Map-pin circle
    pcx, pcy = px(16, 8)
    pr8 = pr(8)
    md.ellipse([pcx - pr8, pcy - pr8, pcx + pr8, pcy + pr8], fill=255)
    # Pin tip triangle
    md.polygon([px(8, 8), px(16, 21), px(24, 8)], fill=255)
    # Ticket body
    tx1, ty1 = px(6, 19)
    tx2, ty2 = px(26, 37)
    md.rounded_rectangle([tx1, ty1, tx2, ty2], radius=pr(3), fill=255)

    # Composite gradient -> bg
    bg_img = Image.new("RGB", (SIZE, SIZE), BG)
    img = Image.composite(gradient, bg_img, mask)

    # Dark cut-outs
    d = ImageDraw.Draw(img)
    pcx, pcy = px(16, 8)
    d.ellipse([pcx - pr(3.2), pcy - pr(3.2), pcx + pr(3.2), pcy + pr(3.2)], fill=BG)
    mid_vio = tuple(round((VIO_TOP[i] + VIO_BOT[i]) / 2) for i in range(3))
    d.ellipse([pcx - pr(1.4), pcy - pr(1.4), pcx + pr(1.4), pcy + pr(1.4)], fill=mid_vio)
    for notch_x in (6, 26):
        ncx, ncy = px(notch_x, 26)
        nr = pr(2.5)
        d.ellipse([ncx - nr, ncy - nr, ncx + nr, ncy + nr], fill=BG)
    line_col = (22, 26, 43)
    for line_y in (25, 29):
        lx1, ly1 = px(11, line_y)
        lx2, ly2 = px(21, line_y + 1.6)
        d.rounded_rectangle([lx1, ly1, lx2, ly2], radius=pr(0.8), fill=line_col)

    # Wordmark "GigTrotter" below glyph
    text = "GigTrotter"
    font_size = 160
    font = None
    for font_path in [
        r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\calibri.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]:
        if os.path.exists(font_path):
            font = ImageFont.truetype(font_path, font_size)
            break

    if font:
        bbox = d.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        text_x = (SIZE - tw) / 2
        text_y = Y_OFF + GLYPH_H + 60
        d.text((text_x, text_y), text, font=font, fill=(210, 200, 240))

    return img


img = make_splash()

splash_dir = r"ios\App\App\Assets.xcassets\Splash.imageset"
for name in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
    out = os.path.join(splash_dir, name)
    img.save(out, "PNG")
    print(f"Saved -> {out}")

img.save("splash_preview.png", "PNG")
print("Preview -> splash_preview.png")
