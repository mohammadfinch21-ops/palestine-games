"""Merge OCR cache into question-cards-data.json (includes placeholders for pending cards)."""
import os
import json
import re
import sys

APP = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(APP, "assets", "images", "questions")
CACHE = os.path.join(APP, "assets", "question-cards-ocr-cache.json")
OUT = os.path.join(APP, "js", "question-cards-data.json")

sys.path.insert(0, APP)
from extract_card_text import enrich_card

cache = {}
if os.path.isfile(CACHE):
    with open(CACHE, encoding="utf-8") as f:
        cache = json.load(f)

files = sorted(
    f for f in os.listdir(IMG_DIR) if f.startswith("q-") and f.lower().endswith((".jpeg", ".jpg", ".png"))
)

cards = []
for f in files:
    if f in cache:
        cards.append(enrich_card(cache[f]))
        continue
    m = re.match(r"q-p(\d+)-(\d+)\.", f)
    page = int(m.group(1)) if m else 0
    idx = int(m.group(2)) if m else 0
    cards.append({
        "id": f"q-p{page:02d}-{idx:02d}",
        "image": f"assets/images/questions/{f}",
        "page": page,
        "index": idx,
        "source": "كرت لعبة قطار فلسطين.pdf",
        "question": "",
        "answer": "",
        "stepsCorrect": 3,
        "stepsWrong": 1,
        "isQuestionCard": False,
    })

cards.sort(key=lambda c: (c["page"], c["index"]))
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(cards, f, ensure_ascii=False, indent=2)

playable = sum(1 for c in cards if c.get("isQuestionCard") and c.get("question"))
print(json.dumps({"total": len(cards), "from_cache": len(cache), "playable": playable}, ensure_ascii=False))
