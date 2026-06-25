"""Extract map preview + memory card images from PDFs."""
import os
import sys

try:
    import fitz
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pymupdf", "pillow", "-q"])
    import fitz

try:
    from PIL import Image
except ImportError:
    from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
OUT_MAP = os.path.join(BASE, "assets")
OUT_MEMORY = os.path.join(BASE, "assets", "images", "memory")
LOG = os.path.join(OUT_MAP, "extract-log.txt")
os.makedirs(OUT_MEMORY, exist_ok=True)

pdfs = [f for f in os.listdir(ROOT) if f.lower().endswith(".pdf")]
lines = ["PDFs in root:"]
for f in pdfs:
    lines.append(f"  {f} ({os.path.getsize(os.path.join(ROOT, f))} bytes)")

map_pdf = os.path.join(ROOT, "الخارطة.pdf")
memory_pdf = os.path.join(ROOT, "بطاقة الذاكرة.pdf")
if not os.path.isfile(memory_pdf):
    memory_pdf = os.path.join(ROOT, "بطاقات الذاكرة.pdf")

# fallback: smallest = map, ~90MB = memory
if not os.path.isfile(map_pdf):
    map_pdf = min([os.path.join(ROOT, f) for f in pdfs], key=os.path.getsize)
if not os.path.isfile(memory_pdf):
    sized = sorted([(os.path.getsize(os.path.join(ROOT, f)), os.path.join(ROOT, f)) for f in pdfs])
    memory_pdf = sized[1][1] if len(sized) > 1 else sized[0][1]

lines.append(f"Map PDF: {map_pdf}")
lines.append(f"Memory PDF: {memory_pdf}")

# --- Map: full preview + rules text ---
doc = fitz.open(map_pdf)
page = doc[0]
preview = os.path.join(OUT_MAP, "pdf-page-1-preview.png")
page.get_pixmap(dpi=200).save(preview)
lines.append(f"Map preview: {preview}")

text = page.get_text()
rules_path = os.path.join(OUT_MAP, "map-rules-text.txt")
with open(rules_path, "w", encoding="utf-8") as f:
    f.write(text)
lines.append(f"Map text saved: {rules_path}")

# logo crop
img = Image.open(preview)
w, h = img.size
logo = img.crop((int(w * 0.018), int(h * 0.008), int(w * 0.105), int(h * 0.125)))
logo.save(os.path.join(OUT_MAP, "logo.png"))
img.crop((0, 0, w, int(h * 0.12))).save(os.path.join(OUT_MAP, "header-banner.png"))
doc.close()

# --- Memory cards: extract embedded images per page ---
mem_doc = fitz.open(memory_pdf)
lines.append(f"Memory pages: {len(mem_doc)}")
img_count = 0
meta = []

for pi in range(len(mem_doc)):
    p = mem_doc[pi]
    page_text = p.get_text().strip().replace("\n", " ")[:120]
    imgs = p.get_images(full=True)
    for j, img_info in enumerate(imgs):
        xref = img_info[0]
        base = mem_doc.extract_image(xref)
        ext = base["ext"]
        if base["width"] < 80 or base["height"] < 80:
            continue
        fname = f"card-p{pi+1:02d}-{j:02d}.{ext}"
        path = os.path.join(OUT_MEMORY, fname)
        with open(path, "wb") as f:
            f.write(base["image"])
        img_count += 1
        meta.append({"file": fname, "page": pi + 1, "w": base["width"], "h": base["height"], "text": page_text})

    # also render page if few embedded images
    if len(imgs) == 0:
        pix = p.get_pixmap(dpi=150)
        fname = f"page-p{pi+1:02d}.png"
        path = os.path.join(OUT_MEMORY, fname)
        pix.save(path)
        meta.append({"file": fname, "page": pi + 1, "w": pix.width, "h": pix.height, "text": page_text, "type": "page_render"})

mem_doc.close()

meta_path = os.path.join(OUT_MEMORY, "cards-meta.json")
with open(meta_path, "w", encoding="utf-8") as f:
    import json
    json.dump(meta, f, ensure_ascii=False, indent=2)

lines.append(f"Memory images: {img_count}")
lines.append(f"Meta: {meta_path}")

with open(LOG, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print("\n".join(lines))
