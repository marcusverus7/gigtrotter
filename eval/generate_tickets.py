#!/usr/bin/env python3
"""
Synthetic event-ticket generator for the GigTrotter parser eval set.

Produces realistic-but-fictional tickets across several made-up ticketing
platforms, in the visual STYLES real platforms use (mobile wallet screenshot,
physical thermal stub, PDF e-ticket). No real brands, logos or trademarks are
reproduced. Every image ships with a ground-truth JSON label.

Output:
  eval/captures/<id>.png        the ticket image
  eval/captures/labels.jsonl    one ground-truth record per line
  eval/captures/labels/<id>.json individual label files (mirror of jsonl)

Usage:
  python3 generate_tickets.py --count 30 --out eval/captures
"""
import argparse, json, os, random, hashlib, datetime as dt
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import qrcode

# ----------------------------------------------------------------------------
# Fonts
# ----------------------------------------------------------------------------
F = "/usr/share/fonts/truetype"
FONTS = {
    "sans":        f"{F}/dejavu/DejaVuSans.ttf",
    "sans_bold":   f"{F}/dejavu/DejaVuSans-Bold.ttf",
    "sans_cond":   f"{F}/dejavu/DejaVuSansCondensed.ttf",
    "sans_cond_b": f"{F}/dejavu/DejaVuSansCondensed-Bold.ttf",
    "mono":        f"{F}/dejavu/DejaVuSansMono.ttf",
    "mono_bold":   f"{F}/dejavu/DejaVuSansMono-Bold.ttf",
    "serif":       f"{F}/dejavu/DejaVuSerif.ttf",
    "serif_bold":  f"{F}/dejavu/DejaVuSerif-Bold.ttf",
    "carlito_b":   f"{F}/crosextra/Carlito-Bold.ttf",
    "carlito":     f"{F}/crosextra/Carlito-Regular.ttf",
}
def font(name, size): return ImageFont.truetype(FONTS[name], size)

# ----------------------------------------------------------------------------
# Fictional content pools (no real artists/venues/brands)
# ----------------------------------------------------------------------------
PLATFORMS = [
    {"name": "TicketHub",  "accent": (216, 38, 64),   "style_bias": "mobile"},
    {"name": "EventWave",  "accent": (255, 102, 0),    "style_bias": "mobile"},
    {"name": "LivePass",   "accent": (29, 161, 142),   "style_bias": "pdf"},
    {"name": "GateZero",   "accent": (88, 86, 214),    "style_bias": "physical"},
    {"name": "Stagely",    "accent": (10, 132, 255),   "style_bias": "mobile"},
    {"name": "RowSeat",    "accent": (175, 82, 222),   "style_bias": "pdf"},
    {"name": "OpenDoor",   "accent": (52, 199, 89),     "style_bias": "physical"},
]

ARTISTS = [
    "The Hollow Coast", "Velvet Arc", "Nocturne Engine", "Marble Tide",
    "Saint Lurid", "Paper Cathedral", "Gloss Hounds", "Iron Lullaby",
    "Cassette Saints", "The Pale Hours", "Future Wreckage", "Bramble & Bone",
    "Neon Vespers", "Static Orchard", "Low Country Kings", "The Murmuration",
    "Glasshouse Riot", "Ember Falls", "Dust Republic", "Wax Cathedral",
]
SUPPORT = [
    "Sister Vega", "The Quiet Type", "Halftone", "Moth & Maple",
    "Pylon", "Coral Static", "Junebug", "Northern Filament", "",
]
VENUES = [
    ("The Limelight", "Belfast"), ("Ulster Hall", "Belfast"),
    ("O2 Forum", "London"), ("Barrowland Ballroom", "Glasgow"),
    ("The Leadmill", "Sheffield"), ("Albert Hall", "Manchester"),
    ("Boilershop", "Newcastle"), ("Rock City", "Nottingham"),
    ("The Junction", "Cambridge"), ("Tramshed", "Cardiff"),
    ("Vicar Street", "Dublin"), ("The Telegraph Building", "Belfast"),
    ("Riverside Pavilion", "Leeds"), ("Northgate Arena", "Chester"),
]
TICKET_TYPES = ["General Admission", "GA Standing", "Seated", "Early Entry",
                "VIP Package", "Balcony", "Stalls", "Circle"]
DELIVERY = ["Mobile Ticket", "Print at Home", "E-Ticket", "Will Call"]

def rid(n=10):
    return "".join(random.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(n))

def make_event():
    artist = random.choice(ARTISTS)
    support = random.choice(SUPPORT)
    venue, city = random.choice(VENUES)
    base = dt.date(2026, 1, 1) + dt.timedelta(days=random.randint(180, 420))
    hour = random.choice([18, 19, 19, 20, 20, 21])
    minute = random.choice([0, 0, 30])
    doors = (dt.datetime.combine(base, dt.time(hour, minute)) - dt.timedelta(minutes=random.choice([30,60,90]))).time()
    seated = random.random() < 0.45
    ttype = random.choice([t for t in TICKET_TYPES if (("Seat" in t or t in ("Stalls","Circle","Balcony")) == seated) or random.random()<0.3])
    price = random.choice([18.50, 22.00, 25.00, 27.50, 32.00, 38.50, 45.00, 55.00, 68.00, 89.50])
    fee = round(price * random.choice([0.10, 0.125, 0.15]) + random.choice([1.50, 2.00, 2.75]), 2)
    rec = {
        "artist": artist,
        "support": support,
        "event_name": f"{artist}" + (f" + {support}" if support else ""),
        "venue": venue,
        "city": city,
        "date_iso": base.isoformat(),
        "date_display": base.strftime("%a %d %b %Y"),
        "doors_time": doors.strftime("%H:%M"),
        "show_time": f"{hour:02d}:{minute:02d}",
        "ticket_type": ttype,
        "seated": seated,
        "section": (random.choice(["Stalls","Circle","Balcony","Block B","Block A","Tier 2"]) if seated else None),
        "row": (random.choice("ABCDEFGHJK") if seated else None),
        "seat": (str(random.randint(1, 48)) if seated else None),
        "price_gbp": price,
        "booking_fee_gbp": fee,
        "total_gbp": round(price + fee, 2),
        "currency": "GBP",
        "order_ref": rid(8),
        "barcode_value": rid(14),
        "delivery": random.choice(DELIVERY),
        "purchaser": random.choice(["M. Loughran","J. Adeyemi","S. Patel","C. O'Neill","A. Kowalski","R. Mensah","E. Byrne","T. Nguyen"]),
        "age_policy": random.choice(["14+", "16+", "18+", "All ages", "Under 14s with adult"]),
    }
    return rec

# ----------------------------------------------------------------------------
# Drawing helpers
# ----------------------------------------------------------------------------
def qr_img(data, box=6):
    q = qrcode.QRCode(border=1, box_size=box,
                      error_correction=qrcode.constants.ERROR_CORRECT_M)
    q.add_data(data); q.make(fit=True)
    return q.make_image(fill_color="black", back_color="white").convert("RGB")

def barcode_img(data, w=520, h=90):
    img = Image.new("RGB", (w, h), "white")
    d = ImageDraw.Draw(img)
    random.seed(int(hashlib.md5(data.encode()).hexdigest(), 16) % (2**31))
    x = 8
    while x < w - 8:
        bw = random.choice([2,2,3,4,1])
        if random.random() < 0.55:
            d.rectangle([x, 6, x+bw, h-22], fill="black")
        x += bw + random.choice([1,2,1])
    random.seed()
    f = font("mono", 16)
    tw = d.textlength(data, font=f)
    d.text(((w-tw)/2, h-18), data, fill="black", font=f)
    return img

def text_w(d, s, f): return d.textlength(s, font=f)

def draw_center(d, cx, y, s, f, fill):
    w = text_w(d, s, f); d.text((cx - w/2, y), s, font=f, fill=fill); return y

# ----------------------------------------------------------------------------
# Style 1: MOBILE wallet-pass screenshot
# ----------------------------------------------------------------------------
def render_mobile(rec, plat):
    W, H = 720, 1480
    img = Image.new("RGB", (W, H), (242, 242, 247))
    d = ImageDraw.Draw(img)
    accent = plat["accent"]

    # status bar
    d.rectangle([0,0,W,54], fill=(255,255,255))
    d.text((28,16), dt.datetime.now().strftime("%H:%M"), font=font("sans_bold",26), fill=(20,20,20))
    d.text((W-150,16), "5G", font=font("sans_bold",22), fill=(20,20,20))
    d.ellipse([W-58,20,W-30,40], outline=(20,20,20), width=3)
    # app nav bar
    d.rectangle([0,54,W,140], fill=(255,255,255))
    d.text((28,80), "‹ Tickets", font=font("sans",30), fill=accent)
    draw_center(d, W/2, 82, plat["name"], font("sans_bold",30), (20,20,20))

    # card
    cx0, cy0, cx1, cy1 = 36, 180, W-36, H-150
    d.rounded_rectangle([cx0,cy0,cx1,cy1], radius=28, fill="white")
    # accent header
    d.rounded_rectangle([cx0,cy0,cx1,cy0+170], radius=28, fill=accent)
    d.rectangle([cx0,cy0+120,cx1,cy0+170], fill=accent)
    d.text((cx0+34, cy0+30), rec["ticket_type"].upper(), font=font("sans_bold",26), fill="white")
    d.text((cx0+34, cy0+74), rec["delivery"], font=font("sans",24), fill=(255,255,255,200))
    d.text((cx1-150, cy0+34), "✓ VALID", font=font("sans_bold",26), fill="white")

    y = cy0 + 210
    # artist
    for line in wrap(d, rec["artist"], font("sans_bold",46), cx1-cx0-68):
        d.text((cx0+34, y), line, font=font("sans_bold",46), fill=(15,15,15)); y += 56
    if rec["support"]:
        d.text((cx0+34, y), f"with {rec['support']}", font=font("sans",28), fill=(110,110,110)); y += 46
    y += 8
    d.text((cx0+34, y), f"{rec['venue']}, {rec['city']}", font=font("sans",30), fill=(40,40,40)); y += 56

    # detail grid
    def field(x, yy, label, val):
        d.text((x, yy), label.upper(), font=font("sans_bold",20), fill=(150,150,150))
        d.text((x, yy+26), val, font=font("sans_bold",30), fill=(20,20,20))
    field(cx0+34, y, "Date", rec["date_display"])
    field(cx1-260, y, "Doors", rec["doors_time"])
    y += 92
    if rec["seated"]:
        field(cx0+34, y, "Section", rec["section"] or "-")
        field(cx0+250, y, "Row", rec["row"] or "-")
        field(cx1-160, y, "Seat", rec["seat"] or "-")
    else:
        field(cx0+34, y, "Admission", "General")
        field(cx1-260, y, "Show", rec["show_time"])
    y += 110

    # dashed separator
    for x in range(cx0+20, cx1-20, 18):
        d.line([x, y, x+9, y], fill=(210,210,210), width=3)
    d.ellipse([cx0-16, y-16, cx0+16, y+16], fill=(242,242,247))
    d.ellipse([cx1-16, y-16, cx1+16, y+16], fill=(242,242,247))
    y += 30

    # QR
    qr = qr_img(rec["barcode_value"], box=7)
    qsz = 300; qr = qr.resize((qsz,qsz))
    img.paste(qr, (int(W/2 - qsz/2), int(y)))
    y += qsz + 8
    draw_center(d, W/2, y, rec["barcode_value"], font("mono_bold",26), (20,20,20)); y += 40
    draw_center(d, W/2, y, f"Order {rec['order_ref']}", font("sans",24), (130,130,130))

    # footer hint
    d.text((cx0+34, cy1-46), rec["purchaser"], font=font("sans",24), fill=(120,120,120))
    d.text((cx1-150, cy1-46), rec["age_policy"], font=font("sans",24), fill=(120,120,120))

    # home indicator
    d.rounded_rectangle([W/2-70, H-26, W/2+70, H-18], radius=4, fill=(180,180,180))
    return img

# ----------------------------------------------------------------------------
# Style 2: PHYSICAL thermal-print stub
# ----------------------------------------------------------------------------
def render_physical(rec, plat):
    W, H = 1000, 440
    img = Image.new("RGB", (W, H), (250, 249, 246))
    d = ImageDraw.Draw(img)
    accent = plat["accent"]
    # paper texture / off-white
    main_w = 740
    # perforation
    for yy in range(14, H-14, 22):
        d.ellipse([main_w-6, yy, main_w+6, yy+10], fill=(250,249,246), outline=(205,205,200))
    d.line([main_w, 0, main_w, H], fill=(220,220,215), width=1)

    # left main stub
    d.rectangle([0,0,90,H], fill=accent)
    vtxt = Image.new("RGB",(H,90),accent); vd=ImageDraw.Draw(vtxt)
    vd.text((20,28), plat["name"].upper()+"  •  ADMIT ONE", font=font("sans_cond_b",34), fill="white")
    img.paste(vtxt.rotate(90, expand=True), (0,0))

    x = 120; y = 28
    d.text((x,y), plat["name"].upper(), font=font("sans_cond_b",30), fill=accent); 
    d.text((main_w-230,y), rec["date_display"], font=font("sans_cond_b",30), fill=(20,20,20))
    y += 52
    d.line([x,y,main_w-30,y], fill=(220,220,215), width=2); y += 18
    for line in wrap(d, rec["artist"].upper(), font("serif_bold",52), main_w-x-40):
        d.text((x,y), line, font=font("serif_bold",52), fill=(15,15,15)); y += 58
    if rec["support"]:
        d.text((x,y), f"SPECIAL GUEST: {rec['support'].upper()}", font=font("sans_cond",26), fill=(90,90,90)); y += 38
    y += 6
    d.text((x,y), f"{rec['venue'].upper()}, {rec['city'].upper()}", font=font("sans_cond_b",30), fill=(30,30,30)); y += 48

    def col(xx, yy, label, val):
        d.text((xx,yy), label, font=font("sans_cond_b",20), fill=(140,140,140))
        d.text((xx,yy+24), val, font=font("mono_bold",30), fill=(20,20,20))
    col(x, y, "DOORS", rec["doors_time"])
    col(x+180, y, "SHOW", rec["show_time"])
    if rec["seated"]:
        col(x+360, y, "ROW/SEAT", f"{rec['row']}{rec['seat']}")
    else:
        col(x+360, y, "TYPE", "GA")
    col(x+560, y, "PRICE", f"£{rec['price_gbp']:.2f}")

    # barcode bottom
    bc = barcode_img(rec["barcode_value"], w=560, h=80)
    img.paste(bc, (x, H-100))

    # right tear-off stub
    sx = main_w + 24
    d.text((sx, 30), "ADMIT ONE", font=font("sans_cond_b",22), fill=accent)
    d.text((sx, 64), rec["artist"][:18], font=font("serif_bold",24), fill=(20,20,20))
    d.text((sx, 110), rec["date_display"], font=font("sans_cond",20), fill=(60,60,60))
    d.text((sx, 140), f"{rec['venue']}", font=font("sans_cond",20), fill=(60,60,60))
    if rec["seated"]:
        d.text((sx, 184), f"{rec['section']}", font=font("sans_cond_b",22), fill=(20,20,20))
        d.text((sx, 214), f"ROW {rec['row']}  SEAT {rec['seat']}", font=font("mono_bold",22), fill=(20,20,20))
    else:
        d.text((sx, 184), "GENERAL", font=font("sans_cond_b",22), fill=(20,20,20))
        d.text((sx, 214), "ADMISSION", font=font("sans_cond_b",22), fill=(20,20,20))
    qr = qr_img(rec["order_ref"], box=4).resize((120,120))
    img.paste(qr, (sx, H-150))
    d.text((sx, H-26), rec["order_ref"], font=font("mono",18), fill=(40,40,40))
    return img

# ----------------------------------------------------------------------------
# Style 3: PDF e-ticket (A4-ish portrait, print-at-home)
# ----------------------------------------------------------------------------
def render_pdf(rec, plat):
    W, H = 840, 1188
    img = Image.new("RGB", (W,H), "white")
    d = ImageDraw.Draw(img)
    accent = plat["accent"]
    # header band
    d.rectangle([0,0,W,150], fill=accent)
    d.text((48,40), plat["name"], font=font("carlito_b",54), fill="white")
    d.text((48,108), "E-TICKET  /  PRINT AT HOME", font=font("sans",24), fill=(255,255,255))
    d.text((W-260,52), rec["delivery"].upper(), font=font("sans_bold",26), fill="white")

    y = 196
    d.text((48,y), "EVENT", font=font("sans_bold",22), fill=(150,150,150)); y+=32
    for line in wrap(d, rec["event_name"], font("carlito_b",46), W-96):
        d.text((48,y), line, font=font("carlito_b",46), fill=(20,20,20)); y+=56
    y += 12
    d.text((48,y), f"{rec['venue']} · {rec['city']}", font=font("carlito",32), fill=(50,50,50)); y+=64

    # box of details
    d.rounded_rectangle([48,y,W-48,y+250], radius=14, outline=(225,225,225), width=2)
    bx, by = 80, y+30
    def cell(cx, cy, label, val):
        d.text((cx,cy), label, font=font("sans_bold",20), fill=(150,150,150))
        d.text((cx,cy+28), val, font=font("carlito_b",32), fill=(20,20,20))
    cell(bx, by, "DATE", rec["date_display"])
    cell(bx+360, by, "DOORS", rec["doors_time"])
    cell(bx, by+90, "SHOW", rec["show_time"])
    cell(bx+360, by+90, "TICKET", rec["ticket_type"])
    if rec["seated"]:
        cell(bx, by+180, "SECTION", rec["section"] or "-")
        cell(bx+360, by+180, "ROW / SEAT", f"{rec['row']} / {rec['seat']}")
    else:
        cell(bx, by+180, "ADMISSION", "General Standing")
        cell(bx+360, by+180, "AGE", rec["age_policy"])
    y += 300

    # price breakdown
    d.text((48,y), "ORDER SUMMARY", font=font("sans_bold",22), fill=(150,150,150)); y+=40
    def line_item(lbl, val):
        nonlocal y
        d.text((60,y), lbl, font=font("carlito",30), fill=(40,40,40))
        vw = text_w(d, val, font("carlito",30))
        d.text((W-60-vw,y), val, font=font("carlito",30), fill=(40,40,40)); y+=42
    line_item("Ticket price", f"£{rec['price_gbp']:.2f}")
    line_item("Booking fee", f"£{rec['booking_fee_gbp']:.2f}")
    d.line([60,y,W-60,y], fill=(220,220,220), width=2); y+=14
    d.text((60,y), "Total", font=font("carlito_b",34), fill=(20,20,20))
    tw = text_w(d, f"£{rec['total_gbp']:.2f}", font("carlito_b",34))
    d.text((W-60-tw,y), f"£{rec['total_gbp']:.2f}", font=font("carlito_b",34), fill=(20,20,20)); y+=80

    # QR + barcode footer
    qr = qr_img(rec["barcode_value"], box=8).resize((230,230))
    img.paste(qr, (60, y))
    d.text((320,y+20), "Order reference", font=font("sans_bold",22), fill=(150,150,150))
    d.text((320,y+50), rec["order_ref"], font=font("mono_bold",40), fill=(20,20,20))
    d.text((320,y+120), "Purchaser", font=font("sans_bold",22), fill=(150,150,150))
    d.text((320,y+150), rec["purchaser"], font=font("carlito_b",32), fill=(20,20,20))
    y += 270
    bc = barcode_img(rec["barcode_value"], w=W-96, h=90)
    img.paste(bc, (48, y))

    # footer
    d.text((48,H-50), f"{plat['name']} · This ticket admits one. Subject to terms.",
           font=font("sans",20), fill=(160,160,160))
    return img

# ----------------------------------------------------------------------------
def wrap(d, text, f, maxw):
    words = text.split(); lines=[]; cur=""
    for w in words:
        t=(cur+" "+w).strip()
        if text_w(d,t,f) <= maxw: cur=t
        else:
            if cur: lines.append(cur)
            cur=w
    if cur: lines.append(cur)
    return lines or [text]

# ----------------------------------------------------------------------------
# Realism degradations
# ----------------------------------------------------------------------------
def degrade(img, mode):
    import numpy as np
    img = img.convert("RGB")
    if mode == "screenshot":
        # slight compression-ish blur + tiny brightness shift
        if random.random()<0.4: img = img.filter(ImageFilter.GaussianBlur(0.4))
        return img
    if mode == "photo":
        # rotate slightly, add shadow gradient, blur, noise -> looks like a phone photo of paper
        ang = random.uniform(-3.5, 3.5)
        img = img.rotate(ang, expand=True, fillcolor=(245,245,245))
        arr = np.asarray(img).astype(np.int16)
        # lighting gradient
        h,w,_ = arr.shape
        gx = np.linspace(random.uniform(-30,10), random.uniform(10,40), w)
        gy = np.linspace(random.uniform(-20,10), random.uniform(10,30), h)
        grad = (gy[:,None] + gx[None,:])[:,:,None]
        arr = np.clip(arr + grad, 0, 255)
        # noise
        arr = np.clip(arr + np.random.normal(0, random.uniform(2,7), arr.shape), 0, 255)
        img = Image.fromarray(arr.astype("uint8"))
        if random.random()<0.6: img = img.filter(ImageFilter.GaussianBlur(random.uniform(0.3,1.0)))
        return img
    return img

# ----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=30)
    ap.add_argument("--out", default="eval/captures")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--layout", choices=["flat","vendor"], default="vendor",
                    help="vendor = <out>/<vendor>/<img>.png + <img>.expected.json (matches eval/run.ts); flat = single folder + labels.jsonl")
    args = ap.parse_args()
    if args.seed is not None: random.seed(args.seed)

    os.makedirs(args.out, exist_ok=True)

    renderers = {"mobile": render_mobile, "physical": render_physical, "pdf": render_pdf}
    # even-ish thirds, slight lean to mobile since that's GigTrotter's main capture path
    base = ["mobile","pdf","physical"]
    style_cycle = []
    while len(style_cycle) < args.count:
        random.shuffle(base); style_cycle += base
    style_cycle = style_cycle[:args.count]
    for k in range(len(style_cycle)):
        if style_cycle[k] != "mobile" and random.random() < 0.15:
            style_cycle[k] = "mobile"

    def starts_at(rec):
        # ISO 8601 local datetime from date + show time, matching run.ts expected schema
        return f"{rec['date_iso']}T{rec['show_time']}:00"

    def expected_sidecar(rec, plat, style):
        # Fields the harness scores. Mirrors run.ts example ({"title":..., "starts_at":...})
        # plus the rest of the parseable surface. Only fields present on the image.
        sc = {
            "title": rec["event_name"],
            "artist": rec["artist"],
            "venue": rec["venue"],
            "city": rec["city"],
            "starts_at": starts_at(rec),
            "doors_at": f"{rec['date_iso']}T{rec['doors_time']}:00",
            "ticket_type": rec["ticket_type"],
            "order_ref": rec["order_ref"],
            "barcode": rec["barcode_value"],
            "price_total": rec["total_gbp"],
            "currency": rec["currency"],
        }
        if rec["seated"]:
            sc["section"] = rec["section"]
            sc["row"] = rec["row"]
            sc["seat"] = rec["seat"]
        return sc

    records = []
    flat_jsonl = open(os.path.join(args.out, "labels.jsonl"), "w") if args.layout == "flat" else None

    for i in range(args.count):
        rec = make_event()
        plat = random.choice(PLATFORMS)
        style = style_cycle[i]
        img = renderers[style](rec, plat)

        if style == "physical":
            img = degrade(img, "photo" if random.random()<0.6 else "none")
        elif style == "pdf":
            img = degrade(img, "photo" if random.random()<0.35 else "screenshot")
        else:
            img = degrade(img, "screenshot")

        tid = f"ticket_{i:03d}_{style}"
        full = {"id": tid, "platform_fictional": plat["name"], "render_style": style, **rec}

        if args.layout == "vendor":
            vendor = plat["name"].lower()
            vdir = os.path.join(args.out, vendor)
            os.makedirs(vdir, exist_ok=True)
            png = os.path.join(vdir, tid + ".png")
            img.save(png, "PNG")
            # harness-scored sidecar
            with open(os.path.join(vdir, tid + ".expected.json"), "w") as sf:
                json.dump(expected_sidecar(rec, plat, style), sf, indent=2)
            full["image"] = f"{vendor}/{tid}.png"
        else:
            png = os.path.join(args.out, tid + ".png")
            img.save(png, "PNG")
            full["image"] = tid + ".png"
            os.makedirs(os.path.join(args.out, "labels"), exist_ok=True)
            with open(os.path.join(args.out, "labels", tid + ".json"), "w") as lf:
                json.dump(full, lf, indent=2)
            flat_jsonl.write(json.dumps(full) + "\n")

        records.append(full)

    if flat_jsonl: flat_jsonl.close()

    # manifest
    with open(os.path.join(args.out, "manifest.json"), "w") as mf:
        json.dump({
            "generated": dt.datetime.now().isoformat(timespec="seconds"),
            "count": len(records),
            "layout": args.layout,
            "styles": {s: sum(1 for r in records if r["render_style"]==s) for s in renderers},
            "vendors": sorted({r["platform_fictional"] for r in records}),
            "expected_schema_fields": ["title","artist","venue","city","starts_at",
                "doors_at","ticket_type","order_ref","barcode","price_total","currency",
                "section","row","seat"],
            "note": "Fully synthetic. Fictional platforms/artists/venues. No real brand IP.",
        }, mf, indent=2)

    print(f"Wrote {len(records)} tickets to {args.out} (layout={args.layout})")
    print("Styles:", {s: sum(1 for r in records if r['render_style']==s) for s in renderers})
    if args.layout == "vendor":
        print("Vendors:", sorted({r['platform_fictional'] for r in records}))

if __name__ == "__main__":
    main()
