"""Analyze and extract all card content from project PDFs."""
import os
import sys
import json
import re

try:
    import fitz
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pymupdf", "-q"])
    import fitz

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.dirname(os.path.abspath(__file__))
OUT_Q = os.path.join(APP, "assets", "images", "questions")
OUT_MEM = os.path.join(APP, "assets", "images", "memory")
LOG = os.path.join(APP, "assets", "pdf-analysis.json")
os.makedirs(OUT_Q, exist_ok=True)
os.makedirs(OUT_MEM, exist_ok=True)

pdfs = []
for f in os.listdir(ROOT):
    if f.lower().endswith(".pdf"):
        pdfs.append((f, os.path.join(ROOT, f), os.path.getsize(os.path.join(ROOT, f))))

analysis = {"pdfs": [], "question_cards": [], "memory_cards": []}

for name, path, size in sorted(pdfs, key=lambda x: x[2]):
    doc = fitz.open(path)
    info = {
        "name": name,
        "path": path,
        "size_bytes": size,
        "pages": len(doc),
        "sample_text": [],
        "images_per_page": [],
        "total_images": 0,
    }
    for i, page in enumerate(doc):
        text = page.get_text().strip()
        if text and i < 3:
            info["sample_text"].append({"page": i + 1, "text": text[:800]})
        imgs = page.get_images(full=True)
        big = sum(1 for im in imgs if True)  # count all
        info["images_per_page"].append({"page": i + 1, "count": len(imgs)})
        info["total_images"] += len(imgs)
    analysis["pdfs"].append(info)
    doc.close()

# Identify PDFs by size/name patterns
map_pdf = None
memory_pdf = None
questions_pdf = None
for name, path, size in pdfs:
    if "ذاكرة" in name or size > 50_000_000 and size < 150_000_000:
        memory_pdf = path
    elif size < 15_000_000:
        map_pdf = path
    elif size > 150_000_000:
        questions_pdf = path

if not map_pdf:
    map_pdf = os.path.join(ROOT, "الخارطة.pdf")
if not memory_pdf:
    for name, path, size in pdfs:
        if 50_000_000 < size < 150_000_000:
            memory_pdf = path
            break
if not questions_pdf:
    for name, path, size in pdfs:
        if size > 150_000_000:
            questions_pdf = path
            break

analysis["identified"] = {
    "map": map_pdf,
    "memory": memory_pdf,
    "questions": questions_pdf,
}

# Extract question cards from large PDF and map PDF
def extract_page_cards(doc, out_dir, prefix, min_dim=200):
    cards = []
    for pi, page in enumerate(doc):
        imgs = page.get_images(full=True)
        for j, img_info in enumerate(imgs):
            xref = img_info[0]
            base = doc.extract_image(xref)
            w, h = base["width"], base["height"]
            if w < min_dim or h < min_dim:
                continue
            ext = base["ext"]
            fname = f"{prefix}-p{pi+1:02d}-{j:02d}.{ext}"
            fpath = os.path.join(out_dir, fname)
            if not os.path.isfile(fpath):
                with open(fpath, "wb") as f:
                    f.write(base["image"])
            text = page.get_text().strip()
            cards.append({
                "file": fname,
                "page": pi + 1,
                "w": w,
                "h": h,
                "page_text": text[:500],
            })
    return cards

if questions_pdf and os.path.isfile(questions_pdf):
    doc = fitz.open(questions_pdf)
    analysis["question_cards"] = extract_page_cards(doc, OUT_Q, "q")
    analysis["questions_pdf_pages"] = len(doc)
    # full text dump first 5 pages
    analysis["questions_text_pages"] = []
    for i in range(min(5, len(doc))):
        analysis["questions_text_pages"].append({
            "page": i + 1,
            "text": doc[i].get_text(),
        })
    doc.close()

if map_pdf and os.path.isfile(map_pdf):
    doc = fitz.open(map_pdf)
    map_cards = extract_page_cards(doc, OUT_Q, "map", min_dim=400)
    analysis["map_embedded_cards"] = map_cards
    doc.close()

if memory_pdf and os.path.isfile(memory_pdf):
    doc = fitz.open(memory_pdf)
    # only extract if not already there
    existing = len([f for f in os.listdir(OUT_MEM) if f.startswith("card-")])
    if existing < 10:
        analysis["memory_cards"] = extract_page_cards(doc, OUT_MEM, "card", min_dim=80)
    else:
        analysis["memory_cards"] = [{"file": f} for f in sorted(os.listdir(OUT_MEM)) if f.startswith("card-")]
    analysis["memory_pages"] = len(doc)
    doc.close()

with open(LOG, "w", encoding="utf-8") as f:
    json.dump(analysis, f, ensure_ascii=False, indent=2)

print(json.dumps({
    "pdfs": [(p["name"], p["pages"], p["total_images"]) for p in analysis["pdfs"]],
    "identified": analysis["identified"],
    "question_cards": len(analysis["question_cards"]),
    "map_cards": len(analysis.get("map_embedded_cards", [])),
    "memory_cards": len(analysis["memory_cards"]),
}, ensure_ascii=False, indent=2))
