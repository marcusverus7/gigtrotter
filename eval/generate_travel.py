#!/usr/bin/env python3
"""
Synthetic NON-TICKET artefacts for the GigTrotter parser eval set.

The ticket corpus (generate_tickets.py) only exercises `kind: "ticket"`. The
parser also claims flight, stay and restaurant, and KNOWN_VENDORS lists airlines,
hotel platforms and reservation systems — none of which had any coverage. This
produces a small set of boarding passes, hotel confirmations and restaurant
reservations so those paths are at least smoke-tested.

All brands, routes and venues are invented. Runs on Windows or Linux (the ticket
generator hardcodes Linux font paths; this one resolves what's available).

Usage:
  python eval/generate_travel.py
  pnpm eval travel
"""
import json, os, random, datetime as dt
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join("eval", "captures", "travel")
SEED = 11

# ── fonts ────────────────────────────────────────────────────────────────────
CANDIDATES = {
    "sans": [
        r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ],
    "bold": [
        r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\arialbd.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ],
    "mono": [
        r"C:\Windows\Fonts\consola.ttf", r"C:\Windows\Fonts\cour.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    ],
}
_cache = {}
def font(kind, size):
    key = (kind, size)
    if key not in _cache:
        for p in CANDIDATES[kind]:
            if os.path.exists(p):
                _cache[key] = ImageFont.truetype(p, size); break
        else:
            _cache[key] = ImageFont.load_default()
    return _cache[key]

def text(d, xy, s, f, fill=(20, 20, 20)):
    d.text(xy, s, font=f, fill=fill)

def label_value(d, x, y, label, value, lsize=20, vsize=34):
    text(d, (x, y), label.upper(), font("sans", lsize), (150, 150, 150))
    text(d, (x, y + lsize + 8), value, font("bold", vsize))

# ── fictional pools ──────────────────────────────────────────────────────────
AIRLINES = [("SkyBridge", "SB", (11, 83, 148)), ("Aerix", "AX", (196, 62, 29))]
AIRPORTS = [
    ("EDI", "Edinburgh", "GB"), ("DUB", "Dublin", "IE"), ("BHD", "Belfast", "GB"),
    ("LGW", "London", "GB"), ("AMS", "Amsterdam", "NL"), ("CDG", "Paris", "FR"),
]
HOTELS = [
    ("Northgate Rooms", "Glasgow", "GB", "RoomNest"),
    ("Harbour Lodge", "Galway", "IE", "StayFinder"),
]
RESTAURANTS = [
    ("The Copper Vine", "Manchester", "GB", "TableTime"),
    ("Saltmarsh Kitchen", "Cork", "IE", "ReserveIt"),
]

def future_date(rng, lo=20, hi=200):
    return dt.date(2026, 7, 28) + dt.timedelta(days=rng.randint(lo, hi))

# ── renderers ────────────────────────────────────────────────────────────────
def render_boarding_pass(rng):
    name, code, accent = rng.choice(AIRLINES)
    (o_iata, o_city, o_cc), (d_iata, d_city, d_cc) = rng.sample(AIRPORTS, 2)
    date = future_date(rng)
    dep = f"{rng.randint(6, 21):02d}:{rng.choice(['05','20','35','50'])}"
    flight = f"{code}{rng.randint(1000, 4999)}"
    seat = f"{rng.randint(1, 32)}{rng.choice('ABCDEF')}"
    gate = f"{rng.choice('ABCD')}{rng.randint(1, 40)}"
    ref = "".join(rng.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))

    W, H = 760, 1180
    img = Image.new("RGB", (W, H), (245, 246, 248))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 150], fill=accent)
    text(d, (40, 46), name, font("bold", 44), (255, 255, 255))
    text(d, (W - 250, 60), "BOARDING PASS", font("sans", 24), (255, 255, 255))

    card = [30, 200, W - 30, 900]
    d.rounded_rectangle(card, radius=22, fill=(255, 255, 255))
    text(d, (60, 240), o_iata, font("bold", 92))
    text(d, (330, 262), "→", font("sans", 56), (150, 150, 150))
    text(d, (W - 250, 240), d_iata, font("bold", 92))
    text(d, (60, 344), o_city, font("sans", 26), (110, 110, 110))
    text(d, (W - 250, 344), d_city, font("sans", 26), (110, 110, 110))

    label_value(d, 60, 420, "Flight", flight)
    label_value(d, 330, 420, "Date", date.strftime("%d %b %Y"), vsize=30)
    label_value(d, 60, 530, "Departs", dep)
    label_value(d, 330, 530, "Gate", gate)
    label_value(d, 520, 530, "Seat", seat)
    label_value(d, 60, 640, "Passenger", "R. NOLAN", vsize=28)
    label_value(d, 330, 640, "Booking ref", ref, vsize=28)

    d.rectangle([60, 760, W - 60, 850], fill=(255, 255, 255))
    x = 66
    while x < W - 66:
        w = rng.choice([3, 3, 6, 9])
        d.rectangle([x, 760, x + w, 850], fill=(20, 20, 20))
        x += w + rng.choice([4, 6, 8])
    text(d, (60, 866), ref, font("mono", 26), (90, 90, 90))

    sidecar = {
        # The prompt specifies flight titles as "FLIGHTNUM ORIGIN→DEST" with a
        # U+2192 arrow, so the answer key must use the same character — an ASCII
        # "->" here would fail every flight on a cosmetic difference.
        "title": f"{flight} {o_iata}→{d_iata}",
        "kind": "flight",
        "city": d_city,
        "country": d_cc,
        "starts_at": f"{date.isoformat()}T{dep}:00",
        "vendor": name.lower(),
        "barcode": ref,
    }
    return img, sidecar

def render_hotel(rng):
    hotel, city, cc, platform = rng.choice(HOTELS)
    ci = future_date(rng)
    co = ci + dt.timedelta(days=rng.randint(1, 4))
    ref = "".join(rng.choice("0123456789") for _ in range(9))

    W, H = 760, 1180
    img = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(img)
    text(d, (40, 46), platform, font("bold", 38), (30, 30, 30))
    text(d, (40, 100), "Booking confirmed", font("sans", 28), (16, 140, 80))
    d.line([40, 150, W - 40, 150], fill=(225, 225, 225), width=2)

    text(d, (40, 190), hotel, font("bold", 46))
    text(d, (40, 250), f"{city}, {cc}", font("sans", 28), (110, 110, 110))

    label_value(d, 40, 330, "Check-in", ci.strftime("%a %d %b %Y"), vsize=28)
    label_value(d, 400, 330, "Check-out", co.strftime("%a %d %b %Y"), vsize=28)
    label_value(d, 40, 450, "Guests", "2 adults", vsize=28)
    label_value(d, 400, 450, "Room", "Double, city view", vsize=26)
    label_value(d, 40, 570, "Confirmation", ref, vsize=28)
    label_value(d, 400, 570, "Check-in from", "15:00", vsize=28)

    d.rounded_rectangle([40, 690, W - 40, 800], radius=14, outline=(225, 225, 225), width=2)
    text(d, (60, 720), "Free cancellation until 48h before arrival",
         font("sans", 24), (90, 90, 90))

    sidecar = {
        "title": hotel,
        "kind": "stay",
        "city": city,
        "country": cc,
        "starts_at": f"{ci.isoformat()}T15:00:00",
        "vendor": platform.lower(),
    }
    return img, sidecar

def render_restaurant(rng):
    name, city, cc, platform = rng.choice(RESTAURANTS)
    date = future_date(rng, 2, 60)
    time_s = f"{rng.randint(17, 21)}:{rng.choice(['00','15','30','45'])}"
    party = rng.randint(2, 8)
    ref = "".join(rng.choice("ABCDEFGHJKLMNPQRSTUVWXYZ0123456789") for _ in range(8))

    W, H = 760, 1000
    img = Image.new("RGB", (W, H), (250, 249, 246))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 120], fill=(28, 40, 34))
    text(d, (40, 40), platform, font("bold", 36), (255, 255, 255))

    text(d, (40, 180), "Your table is booked", font("sans", 28), (110, 110, 110))
    text(d, (40, 230), name, font("bold", 48))
    text(d, (40, 300), f"{city}, {cc}", font("sans", 26), (110, 110, 110))

    d.rounded_rectangle([40, 370, W - 40, 620], radius=18, fill=(255, 255, 255))
    label_value(d, 70, 400, "Date", date.strftime("%a %d %b %Y"), vsize=28)
    label_value(d, 430, 400, "Time", time_s)
    label_value(d, 70, 510, "Party size", f"{party} people", vsize=28)
    label_value(d, 430, 510, "Reference", ref, vsize=26)

    text(d, (40, 680), "Please arrive within 15 minutes of your booking time.",
         font("sans", 22), (120, 120, 120))

    sidecar = {
        "title": name,
        "kind": "restaurant",
        "city": city,
        "country": cc,
        "starts_at": f"{date.isoformat()}T{time_s}:00",
        "vendor": platform.lower(),
    }
    return img, sidecar

# ── main ─────────────────────────────────────────────────────────────────────
def main():
    os.makedirs(OUT, exist_ok=True)
    rng = random.Random(SEED)
    plan = [("flight", render_boarding_pass, 2),
            ("stay", render_hotel, 2),
            ("restaurant", render_restaurant, 2)]
    n = 0
    for kind, fn, count in plan:
        for i in range(count):
            img, sidecar = fn(rng)
            stem = f"{kind}_{i:02d}"
            img.save(os.path.join(OUT, stem + ".png"), "PNG")
            # utf-8 WITHOUT a BOM: run.ts strips one defensively, but a BOM here
            # previously invalidated 26 sidecars silently and inflated the score.
            with open(os.path.join(OUT, stem + ".expected.json"), "w",
                      encoding="utf-8", newline="\n") as f:
                json.dump(sidecar, f, indent=2, ensure_ascii=False)
            print(f"  wrote {stem}.png")
            n += 1
    print(f"{n} travel artefacts -> {OUT}")

if __name__ == "__main__":
    main()
