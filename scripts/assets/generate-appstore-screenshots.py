"""Generate App Store screenshots for GigTrotter (1284x2778 iPhone 6.7")."""

from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1284, 2778
OUT = os.path.join(os.path.dirname(__file__), "appstore-screenshots")
os.makedirs(OUT, exist_ok=True)

FONT_DIR = "C:/Windows/Fonts"
font_bold = ImageFont.truetype(f"{FONT_DIR}/segoeuib.ttf", 88)
font_reg = ImageFont.truetype(f"{FONT_DIR}/segoeui.ttf", 52)
font_small = ImageFont.truetype(f"{FONT_DIR}/segoeui.ttf", 42)
font_hero = ImageFont.truetype(f"{FONT_DIR}/segoeuib.ttf", 120)
font_emoji = ImageFont.truetype(f"{FONT_DIR}/segoeuib.ttf", 140)
font_feature_title = ImageFont.truetype(f"{FONT_DIR}/segoeuib.ttf", 68)
font_feature_body = ImageFont.truetype(f"{FONT_DIR}/segoeui.ttf", 46)
font_app_title = ImageFont.truetype(f"{FONT_DIR}/segoeuib.ttf", 56)


def gradient_bg(draw, w, h, colors):
    """Draw a vertical gradient between two RGB tuples."""
    r1, g1, b1 = colors[0]
    r2, g2, b2 = colors[1]
    for y in range(h):
        t = y / h
        r = int(r1 + (r2 - r1) * t)
        g = int(g1 + (g2 - g1) * t)
        b = int(b1 + (b2 - b1) * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))


def draw_rounded_rect(draw, bbox, radius, fill):
    x0, y0, x1, y1 = bbox
    draw.rounded_rectangle(bbox, radius=radius, fill=fill)


def draw_phone_frame(img, x, y, pw, ph, screen_color=(20, 15, 35)):
    """Draw a simplified phone mockup frame."""
    draw = ImageDraw.Draw(img)
    frame_r = 40
    bezel = 12
    draw.rounded_rectangle(
        [x - bezel, y - bezel, x + pw + bezel, y + ph + bezel],
        radius=frame_r + bezel,
        fill=(60, 60, 70),
    )
    draw.rounded_rectangle(
        [x, y, x + pw, y + ph],
        radius=frame_r,
        fill=screen_color,
    )
    notch_w, notch_h = 160, 28
    draw.rounded_rectangle(
        [x + pw // 2 - notch_w // 2, y - 4, x + pw // 2 + notch_w // 2, y + notch_h],
        radius=14,
        fill=(60, 60, 70),
    )


def draw_text_center(draw, y, text, font, fill=(255, 255, 255)):
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) // 2, y), text, font=font, fill=fill)


def draw_text_wrapped(draw, x, y, text, font, fill, max_w, line_spacing=10):
    words = text.split()
    lines, current = [], ""
    for word in words:
        test = f"{current} {word}".strip()
        if draw.textbbox((0, 0), test, font=font)[2] <= max_w:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)

    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        y += draw.textbbox((0, 0), line, font=font)[3] + line_spacing
    return y


# ── Screenshot 1: Hero / Landing ──────────────────────────
def make_ss1():
    img = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(img)
    gradient_bg(draw, W, H, [(15, 10, 30), (40, 15, 60)])

    # Top tagline
    draw_text_center(draw, 160, "Your gig life,", font_hero, (255, 255, 255))
    draw_text_center(draw, 300, "mapped.", font_hero, (168, 85, 247))

    draw_text_center(
        draw, 480,
        "Track every concert, festival & night out",
        font_reg, (180, 180, 200),
    )

    # Phone mockup area
    px, py, pw, ph = W // 2 - 280, 650, 560, 1100
    draw_phone_frame(img, px, py, pw, ph)
    d = ImageDraw.Draw(img)

    # Simulate app screen inside phone
    # Nav bar
    d.rectangle([px, py, px + pw, py + 70], fill=(25, 20, 45))
    d.text((px + 20, py + 18), "GigTrotter", font=font_app_title, fill=(168, 85, 247))

    # Hero text inside phone
    d.text((px + 30, py + 120), "The gig never", font=font_feature_title, fill=(255, 255, 255))
    d.text((px + 30, py + 200), "ends.", font=font_feature_title, fill=(168, 85, 247))

    # Feature cards
    card_y = py + 340
    for i, (icon, label) in enumerate([
        ("W", "Ticket Wallet"),
        ("M", "Travel Map"),
        ("E", "Events"),
        ("S", "Stats"),
    ]):
        cy = card_y + i * 160
        draw_rounded_rect(d, [px + 30, cy, px + pw - 30, cy + 130], 20, (35, 28, 60))
        d.rounded_rectangle(
            [px + 50, cy + 25, px + 130, cy + 105], radius=15, fill=(168, 85, 247, 80)
        )
        d.text((px + 60, cy + 35), icon, font=font_bold, fill=(200, 160, 255))
        d.text((px + 155, cy + 45), label, font=font_feature_title, fill=(255, 255, 255))

    # CTA buttons inside phone
    btn_y = card_y + 4 * 160 + 40
    draw_rounded_rect(d, [px + 30, btn_y, px + pw // 2 - 10, btn_y + 70], 35, (168, 85, 247))
    d.text((px + 60, btn_y + 12), "Get started", font=font_small, fill=(255, 255, 255))

    # Bottom text
    draw_text_center(draw, 1850, "DISCOVER  ·  ATTEND  ·  SHARE  ·  REMEMBER", font_small, (120, 100, 160))

    # Feature highlights at bottom
    features = [
        ("Ticket Wallet", "Store and showcase every gig you've attended"),
        ("Interactive Map", "See your live music journey across the globe"),
        ("Social Events", "Find gigs, buy tickets, join the conversation"),
    ]
    fy = 1980
    for title, desc in features:
        draw_rounded_rect(draw, [100, fy, W - 100, fy + 180], 24, (30, 22, 55))
        draw.text((140, fy + 25), title, font=font_feature_title, fill=(168, 85, 247))
        draw.text((140, fy + 105), desc, font=font_small, fill=(180, 175, 200))
        fy += 210

    img.save(os.path.join(OUT, "01_hero.png"))
    print("  01_hero.png")


# ── Screenshot 2: Wallet ──────────────────────────────────
def make_ss2():
    img = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(img)
    gradient_bg(draw, W, H, [(12, 8, 28), (30, 12, 55)])

    draw_text_center(draw, 160, "Your Ticket Wallet", font_hero, (255, 255, 255))
    draw_text_center(draw, 320, "Every gig. One beautiful collection.", font_reg, (160, 150, 185))

    # Ticket cards
    tickets = [
        ("Arctic Monkeys", "O2 Arena, London", "15 Mar 2026", (168, 85, 247)),
        ("Fontaines D.C.", "Brixton Academy", "22 Apr 2026", (59, 130, 246)),
        ("Charli XCX", "Alexandra Palace", "8 May 2026", (236, 72, 153)),
        ("Radiohead", "Glastonbury Festival", "28 Jun 2026", (16, 185, 129)),
        ("The National", "Royal Albert Hall", "3 Jul 2026", (245, 158, 11)),
    ]

    ty = 480
    for name, venue, date, accent in tickets:
        # Card background
        draw_rounded_rect(draw, [100, ty, W - 100, ty + 340], 28, (28, 22, 50))

        # Accent bar on left
        draw.rectangle([100, ty + 20, 116, ty + 320], fill=accent)

        # Ticket content
        draw.text((150, ty + 30), name, font=font_bold, fill=(255, 255, 255))
        draw.text((150, ty + 140), venue, font=font_reg, fill=(160, 155, 185))
        draw.text((150, ty + 210), date, font=font_small, fill=accent)

        # "Verified" badge
        badge_x = W - 300
        draw_rounded_rect(draw, [badge_x, ty + 30, badge_x + 170, ty + 80], 25, (*accent, 40))
        draw.text((badge_x + 20, ty + 35), "Verified", font=font_small, fill=accent)

        ty += 380

    # Bottom stat bar
    draw_rounded_rect(draw, [100, ty + 20, W - 100, ty + 140], 24, (35, 28, 60))
    stats = ["47 Gigs", "12 Venues", "5 Countries"]
    sx = 180
    for s in stats:
        draw.text((sx, ty + 50), s, font=font_feature_title, fill=(168, 85, 247))
        sx += 340

    img.save(os.path.join(OUT, "02_wallet.png"))
    print("  02_wallet.png")


# ── Screenshot 3: Travel Map ──────────────────────────────
def make_ss3():
    img = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(img)
    gradient_bg(draw, W, H, [(8, 15, 30), (15, 30, 55)])

    draw_text_center(draw, 160, "Your Music Map", font_hero, (255, 255, 255))
    draw_text_center(draw, 320, "See every venue you've conquered.", font_reg, (140, 165, 200))

    # Simulated map area
    map_y = 480
    map_h = 1400
    draw_rounded_rect(draw, [60, map_y, W - 60, map_y + map_h], 30, (18, 25, 45))

    # Grid lines (latitude/longitude feel)
    for i in range(8):
        y_line = map_y + 100 + i * (map_h - 200) // 7
        draw.line([(80, y_line), (W - 80, y_line)], fill=(30, 40, 65), width=1)
    for i in range(6):
        x_line = 80 + i * (W - 160) // 5
        draw.line([(x_line, map_y + 50), (x_line, map_y + map_h - 50)], fill=(30, 40, 65), width=1)

    # Venue pins
    pins = [
        (350, map_y + 300, "London", 8, (168, 85, 247)),
        (500, map_y + 350, "Manchester", 5, (236, 72, 153)),
        (280, map_y + 250, "Glasgow", 3, (59, 130, 246)),
        (700, map_y + 500, "Berlin", 4, (16, 185, 129)),
        (850, map_y + 420, "Amsterdam", 2, (245, 158, 11)),
        (600, map_y + 700, "Barcelona", 3, (168, 85, 247)),
        (450, map_y + 900, "Lisbon", 1, (59, 130, 246)),
        (900, map_y + 800, "Prague", 2, (236, 72, 153)),
        (1050, map_y + 350, "Copenhagen", 1, (16, 185, 129)),
        (200, map_y + 600, "Dublin", 4, (245, 158, 11)),
    ]

    for px, py, city, count, color in pins:
        # Glow effect
        for r in range(30, 0, -5):
            alpha_color = tuple(c // 3 for c in color)
            draw.ellipse([px - r, py - r, px + r, py + r], fill=alpha_color)
        # Pin dot
        dot_r = 12 + count * 3
        draw.ellipse([px - dot_r, py - dot_r, px + dot_r, py + dot_r], fill=color)
        draw.text((px + dot_r + 10, py - 15), f"{city} ({count})", font=font_small, fill=(200, 200, 220))

    # Stats bar at bottom
    stat_y = map_y + map_h + 60
    draw_rounded_rect(draw, [100, stat_y, W - 100, stat_y + 260], 24, (25, 20, 48))

    col_w = (W - 200) // 3
    stats = [
        ("10", "Cities"),
        ("33", "Venues"),
        ("5", "Countries"),
    ]
    for i, (num, label) in enumerate(stats):
        cx = 100 + col_w * i + col_w // 2
        nb = draw.textbbox((0, 0), num, font=font_hero)
        draw.text((cx - (nb[2] - nb[0]) // 2, stat_y + 30), num, font=font_hero, fill=(168, 85, 247))
        lb = draw.textbbox((0, 0), label, font=font_reg)
        draw.text((cx - (lb[2] - lb[0]) // 2, stat_y + 170), label, font=font_reg, fill=(150, 145, 180))

    img.save(os.path.join(OUT, "03_map.png"))
    print("  03_map.png")


# ── Screenshot 4: Events Discovery ────────────────────────
def make_ss4():
    img = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(img)
    gradient_bg(draw, W, H, [(15, 10, 32), (35, 15, 58)])

    draw_text_center(draw, 160, "Discover Events", font_hero, (255, 255, 255))
    draw_text_center(draw, 320, "Find gigs. Grab tickets. Join the chat.", font_reg, (160, 150, 185))

    # Search bar
    draw_rounded_rect(draw, [100, 460, W - 100, 540], 40, (40, 32, 65))
    draw.text((140, 475), "Search events, artists, venues...", font=font_small, fill=(120, 110, 150))

    # Category chips
    cats = ["All", "Concerts", "Festivals", "Club", "Theatre", "Comedy"]
    cx = 100
    for cat in cats:
        cw = draw.textbbox((0, 0), cat, font=font_small)[2] + 50
        active = cat == "Concerts"
        fill = (168, 85, 247) if active else (35, 28, 60)
        draw_rounded_rect(draw, [cx, 580, cx + cw, 640], 30, fill)
        draw.text((cx + 25, 588), cat, font=font_small, fill=(255, 255, 255) if active else (150, 140, 175))
        cx += cw + 20

    # Event cards
    events = [
        ("Arctic Monkeys", "O2 Arena, London", "Sat 15 Mar · 19:00", "From £45", (168, 85, 247)),
        ("Fontaines D.C.", "Brixton Academy", "Tue 22 Apr · 20:00", "From £35", (59, 130, 246)),
        ("Charli XCX — BRAT Tour", "Alexandra Palace", "Thu 8 May · 19:30", "From £55", (236, 72, 153)),
        ("Glastonbury Festival 2026", "Worthy Farm, Somerset", "Fri 27 Jun · All day", "SOLD OUT", (16, 185, 129)),
        ("The National", "Royal Albert Hall", "Sat 3 Jul · 19:30", "From £40", (245, 158, 11)),
    ]

    ey = 700
    for name, venue, time, price, accent in events:
        draw_rounded_rect(draw, [100, ey, W - 100, ey + 320], 24, (28, 22, 50))

        # Accent image placeholder
        draw_rounded_rect(draw, [130, ey + 25, 330, ey + 295], 18, accent)
        draw.text((170, ey + 120), name[:2].upper(), font=font_hero, fill=(255, 255, 255, 180))

        # Event info
        draw.text((360, ey + 30), name, font=font_feature_title, fill=(255, 255, 255))
        draw.text((360, ey + 115), venue, font=font_small, fill=(150, 145, 180))
        draw.text((360, ey + 175), time, font=font_small, fill=accent)

        # Price + button
        is_sold = "SOLD" in price
        btn_fill = (80, 70, 100) if is_sold else accent
        draw_rounded_rect(draw, [360, ey + 235, 560, ey + 290], 28, btn_fill)
        draw.text((390, ey + 243), price, font=font_small, fill=(255, 255, 255))

        # Going count
        draw.text((600, ey + 243), "127 going", font=font_small, fill=(120, 110, 150))

        ey += 360

    img.save(os.path.join(OUT, "04_events.png"))
    print("  04_events.png")


# ── Screenshot 5: Stats & Year in Review ──────────────────
def make_ss5():
    img = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(img)
    gradient_bg(draw, W, H, [(18, 10, 35), (45, 18, 65)])

    draw_text_center(draw, 160, "Your Year in", font_hero, (255, 255, 255))
    draw_text_center(draw, 300, "Live Music", font_hero, (168, 85, 247))

    draw_text_center(draw, 470, "2025 Wrapped", font_reg, (140, 130, 170))

    # Big stat cards
    big_stats = [
        ("47", "Gigs attended"),
        ("12", "Unique venues"),
        ("5", "Countries visited"),
    ]
    sy = 600
    for num, label in big_stats:
        draw_rounded_rect(draw, [100, sy, W - 100, sy + 240], 28, (30, 24, 55))
        nb = draw.textbbox((0, 0), num, font=font_hero)
        draw.text((200, sy + 40), num, font=font_hero, fill=(168, 85, 247))
        draw.text((200, sy + 160), label, font=font_reg, fill=(180, 175, 205))

        # Decorative bar
        bar_w = min(int(num) * 18, W - 400)
        draw_rounded_rect(draw, [W - 200 - bar_w, sy + 90, W - 200, sy + 110], 10, (168, 85, 247))

        sy += 280

    # Top artists section
    sy += 40
    draw.text((100, sy), "Top Artists", font=font_bold, fill=(255, 255, 255))
    sy += 110

    top_artists = [
        ("Arctic Monkeys", "7 gigs", (168, 85, 247)),
        ("Fontaines D.C.", "5 gigs", (59, 130, 246)),
        ("Charli XCX", "4 gigs", (236, 72, 153)),
        ("The National", "3 gigs", (16, 185, 129)),
    ]

    for i, (artist, count, color) in enumerate(top_artists):
        draw_rounded_rect(draw, [100, sy, W - 100, sy + 110], 18, (28, 22, 50))
        # Rank
        draw.text((140, sy + 22), f"#{i + 1}", font=font_feature_title, fill=color)
        draw.text((260, sy + 28), artist, font=font_feature_title, fill=(255, 255, 255))
        draw.text((W - 300, sy + 28), count, font=font_feature_title, fill=color)
        sy += 140

    # Share button
    sy += 40
    btn_w = 500
    draw_rounded_rect(
        draw, [W // 2 - btn_w // 2, sy, W // 2 + btn_w // 2, sy + 90], 45, (168, 85, 247)
    )
    draw_text_center(draw, sy + 18, "Share your year", font_feature_title, (255, 255, 255))

    img.save(os.path.join(OUT, "05_stats.png"))
    print("  05_stats.png")


# ── Screenshot 6: Social / Discussion ─────────────────────
def make_ss6():
    img = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(img)
    gradient_bg(draw, W, H, [(12, 10, 28), (32, 15, 52)])

    draw_text_center(draw, 160, "Join the", font_hero, (255, 255, 255))
    draw_text_center(draw, 300, "Conversation", font_hero, (168, 85, 247))
    draw_text_center(draw, 470, "Connect with fellow gig-goers.", font_reg, (160, 150, 185))

    # Discussion thread mockup
    posts = [
        ("Sarah M.", "Arctic Monkeys @ O2", "The setlist was incredible! They played Mardy Bum as the encore. Absolutely lost it.", "2h ago", "42", "12"),
        ("James K.", "Arctic Monkeys @ O2", "Anyone else catch Alex's guitar change during 505? Sounded different from the album version.", "3h ago", "28", "8"),
        ("Emma L.", "Glastonbury Tips", "First timer here! What's the best camping spot for easy access to the Pyramid Stage?", "5h ago", "67", "31"),
        ("Tom B.", "Fontaines D.C. Review", "Carlos O'Connell is the best frontman in rock right now. No debate.", "6h ago", "89", "15"),
    ]

    py = 600
    for name, thread, text, time, likes, replies in posts:
        card_h = 340
        draw_rounded_rect(draw, [100, py, W - 100, py + card_h], 24, (28, 22, 50))

        # Avatar circle
        draw.ellipse([140, py + 30, 210, py + 100], fill=(168, 85, 247))
        draw.text((152, py + 40), name[0], font=font_feature_title, fill=(255, 255, 255))

        # Name + thread
        draw.text((240, py + 30), name, font=font_feature_title, fill=(255, 255, 255))
        draw.text((240, py + 100), thread, font=font_small, fill=(168, 85, 247))

        # Post text
        draw_text_wrapped(draw, 140, py + 160, text, font_small, (190, 185, 210), W - 280)

        # Footer: time, likes, replies
        draw.text((140, py + card_h - 60), time, font=font_small, fill=(100, 95, 130))
        draw.text((400, py + card_h - 60), f"{likes} likes", font=font_small, fill=(168, 85, 247))
        draw.text((650, py + card_h - 60), f"{replies} replies", font=font_small, fill=(100, 95, 130))

        py += card_h + 30

    # Bottom CTA
    py += 20
    draw_rounded_rect(draw, [100, py, W - 100, py + 80], 40, (40, 32, 65))
    draw.text((140, py + 14), "Write a post...", font=font_reg, fill=(100, 95, 130))

    img.save(os.path.join(OUT, "06_social.png"))
    print("  06_social.png")


if __name__ == "__main__":
    print("Generating App Store screenshots (1284x2778)...")
    make_ss1()
    make_ss2()
    make_ss3()
    make_ss4()
    make_ss5()
    make_ss6()
    print(f"\nDone! Screenshots saved to: {OUT}")
