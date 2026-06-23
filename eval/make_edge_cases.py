#!/usr/bin/env python3
"""Edge-case tickets for eval/captures/edge-cases/: hard crops, multi-ticket
sheets, heavy rotation, glare. Reuses the main generator's renderers."""
import sys, os, json, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import importlib.util
spec = importlib.util.spec_from_file_location("gt", "generate_tickets.py")
gt = importlib.util.module_from_spec(spec); spec.loader.exec_module(gt)

OUT = sys.argv[2] if len(sys.argv) > 2 and sys.argv[1]=="--out" else "eval/captures/edge-cases"
os.makedirs(OUT, exist_ok=True)
random.seed(11)

def sidecar(rec):
    sc = {"title": rec["event_name"], "artist": rec["artist"], "venue": rec["venue"],
          "city": rec["city"], "starts_at": f"{rec['date_iso']}T{rec['show_time']}:00",
          "doors_at": f"{rec['date_iso']}T{rec['doors_time']}:00",
          "ticket_type": rec["ticket_type"], "order_ref": rec["order_ref"],
          "barcode": rec["barcode_value"], "price_total": rec["total_gbp"], "currency": rec["currency"]}
    if rec["seated"]:
        sc.update(section=rec["section"], row=rec["row"], seat=rec["seat"])
    return sc

def save(img, name, rec):
    img.convert("RGB").save(os.path.join(OUT, name+".png"))
    with open(os.path.join(OUT, name+".expected.json"),"w") as f:
        json.dump(sidecar(rec), f, indent=2)

plats = gt.PLATFORMS

# 1. Hard crop — top 60% only (footer/barcode cut off)
rec = gt.make_event(); img = gt.render_mobile(rec, random.choice(plats))
w,h = img.size; save(img.crop((0,0,w,int(h*0.6))), "edge_crop_top", rec)

# 2. Hard crop — bottom half (header/title cut off; parser must still find QR+order)
rec = gt.make_event(); img = gt.render_pdf(rec, random.choice(plats))
w,h = img.size; save(img.crop((0,int(h*0.45),w,h)), "edge_crop_bottom", rec)

# 3. Heavy rotation (~18 deg) + glare blob
rec = gt.make_event(); img = gt.render_physical(rec, random.choice(plats)).rotate(18, expand=True, fillcolor=(240,240,240))
arr = np.asarray(img.convert("RGB")).astype(np.int16)
yy,xx = np.ogrid[:arr.shape[0],:arr.shape[1]]
cx,cy = arr.shape[1]*0.65, arr.shape[0]*0.4
glare = np.clip(120 - ((xx-cx)**2+(yy-cy)**2)/900, 0, 120)[:,:,None]
img = Image.fromarray(np.clip(arr+glare,0,255).astype("uint8"))
save(img, "edge_rotated_glare", rec)

# 4. Multi-ticket sheet (two stacked stubs) — sidecar covers the FIRST/top ticket
r1 = gt.make_event(); r2 = gt.make_event()
i1 = gt.render_physical(r1, random.choice(plats)); i2 = gt.render_physical(r2, random.choice(plats))
W = max(i1.width,i2.width); sheet = Image.new("RGB",(W, i1.height+i2.height+30),(235,235,235))
sheet.paste(i1,(0,0)); sheet.paste(i2,(0,i1.height+30))
save(sheet, "edge_multi_ticket", r1)

# 5. Low-res / heavy compression sim (downscale then upscale + blur)
rec = gt.make_event(); img = gt.render_mobile(rec, random.choice(plats))
small = img.resize((img.width//3, img.height//3)).resize(img.size)
save(small.filter(ImageFilter.GaussianBlur(0.8)), "edge_lowres", rec)

# 6. Dark-mode screenshot (inverted-ish background)
rec = gt.make_event(); img = gt.render_mobile(rec, random.choice(plats)).convert("RGB")
arr = np.asarray(img).astype(np.int16)
# invert only near-white backgrounds to dark, keep accent/qr
mask = (arr.sum(axis=2) > 680)
arr[mask] = 24
save(Image.fromarray(np.clip(arr,0,255).astype("uint8")), "edge_darkmode", rec)

print("edge cases written to", OUT)
print(sorted(os.listdir(OUT)))
