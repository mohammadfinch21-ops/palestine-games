"""Check card dimensions to filter cover pages."""
import os
from PIL import Image

APP = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(APP, "assets", "images", "questions")
sizes = {}
for f in sorted(os.listdir(IMG_DIR))[:30]:
    if not f.startswith("q-"):
        continue
    im = Image.open(os.path.join(IMG_DIR, f))
    sizes[f] = im.size

from collections import Counter
all_sizes = Counter()
for f in os.listdir(IMG_DIR):
    if f.startswith("q-"):
        im = Image.open(os.path.join(IMG_DIR, f))
        all_sizes[im.size] += 1

print("Size distribution:", dict(all_sizes))
for k, v in list(sizes.items())[:5]:
    print(k, v)
