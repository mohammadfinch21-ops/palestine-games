"""Extract rope border slice from a sample card for CSS border-image."""
import os
from PIL import Image

APP = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(APP, "assets", "images", "questions", "q-p01-00.jpeg")
OUT = os.path.join(APP, "assets", "images", "card-rope-border.png")

img = Image.open(SRC).convert("RGBA")
w, h = img.size
# Full card with transparent center — keep only border band (~14% inset)
inset = int(min(w, h) * 0.13)
inner = img.crop((inset, inset, w - inset, h - inset))
# Create mask: border area opaque, center transparent
out = img.copy()
px = out.load()
for y in range(h):
    for x in range(w):
        if inset <= x < w - inset and inset <= y < h - inset:
            px[x, y] = (92, 45, 145, 0)  # transparent center
out.save(OUT)
print(f"Saved {OUT} ({out.size})")
