"""One-off analysis for train game redesign."""
import json
import os
from collections import Counter, defaultdict

import fitz
import numpy as np
from PIL import Image

APP = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(APP)
MAP_PDF = os.path.join(ROOT, "الخارطة.pdf")

with open(os.path.join(APP, "js", "question-cards-data.json"), encoding="utf-8") as f:
    cards = json.load(f)


def crop_frac(pil, frac):
    w, h = pil.size
    return pil.crop((int(frac[0] * w), int(frac[1] * h), int(frac[2] * w), int(frac[3] * h)))


def detect_color(pil):
    mid = crop_frac(pil, (0.05, 0.45, 0.95, 0.70))
    arr = np.array(mid)
    r, g, b = arr[:, :, 0].astype(int), arr[:, :, 1].astype(int), arr[:, :, 2].astype(int)
    masks = {
        "red": (r > 140) & (g < 90) & (b < 90),
        "purple": (r > 70) & (b > 90) & (g < r * 0.72) & (b > g),
        "yellow": (r > 170) & (g > 130) & (b < 120) & (r > g),
        "green": (g > 100) & (r < g * 0.95) & (b < g * 0.9) & (g > 80),
        "brown": (r > 90) & (g > 50) & (b < 80) & (r > g) & (g > b) & (r < 180),
    }
    scores = {k: v.sum() / v.size for k, v in masks.items()}
    best = max(scores, key=scores.get)
    if scores[best] < 0.08:
        return "unknown"
    return best


page_colors = defaultdict(Counter)
for c in cards:
    p = c.get("page", 0)
    img = c.get("image", "")
    path = os.path.join(APP, img.replace("/", os.sep))
    if os.path.isfile(path):
        page_colors[p][detect_color(Image.open(path).convert("RGB"))] += 1

print("=== Page dominant colors ===")
for p in sorted(page_colors):
    dom = page_colors[p].most_common(1)[0][0]
    print(f"page {p:02d}: {dom} — {dict(page_colors[p])}")

print("\n=== bgColor in json ===")
print(dict(Counter(c.get("bgColor") for c in cards)))

playable = [c for c in cards if c.get("isQuestionCard")]
print(f"\nplayable {len(playable)} / {len(cards)}")

# Map positions — duplicate numbers exist in legend/rules; pick largest font (path marker)
from collections import defaultdict

doc = fitz.open(MAP_PDF)
page = doc[0]
w, h = page.rect.width, page.rect.height
hits = defaultdict(list)
for b in page.get_text("dict")["blocks"]:
    if b.get("type") != 0:
        continue
    for line in b["lines"]:
        for span in line["spans"]:
            t = span["text"].strip()
            if t.isdigit() and 1 <= int(t) <= 100:
                n = int(t)
                x0, y0, x1, y1 = span["bbox"]
                hits[n].append(
                    {
                        "x": round((x0 + x1) / 2 / w * 100, 2),
                        "y": round((y0 + y1) / 2 / h * 100, 2),
                        "size": span.get("size", 0),
                    }
                )
doc.close()

nums = {}
for n in range(1, 101):
    if n in hits:
        best = max(hits[n], key=lambda h: h["size"])
        nums[n] = {"x": best["x"], "y": best["y"]}

print(f"\n=== Map positions: {len(nums)}/100 ===")
missing = [i for i in range(1, 101) if i not in nums]
print("missing:", missing)
for i in [1, 25, 50, 75, 100]:
    print(i, nums.get(i))

map_out = os.path.join(APP, "_map_path.json")
js_map_out = os.path.join(APP, "js", "map-path.json")
with open(map_out, "w", encoding="utf-8") as f:
    json.dump(nums, f, ensure_ascii=False, indent=2)
with open(js_map_out, "w", encoding="utf-8") as f:
    json.dump({str(k): v for k, v in nums.items()}, f, ensure_ascii=False, indent=2)
print("Wrote _map_path.json and js/map-path.json")
