"""Build question-cards-data.json from extracted PDF images.
Run extract_card_text.py afterward to add question/answer/steps text fields."""
import os
import json
import re

APP = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(APP, "assets", "images", "questions")
OUT = os.path.join(APP, "js", "question-cards-data.json")

files = sorted(
    f for f in os.listdir(IMG_DIR)
    if f.startswith("q-") and f.lower().endswith((".jpeg", ".jpg", ".png"))
)

cards = []
for f in files:
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

with open(OUT, "w", encoding="utf-8") as fp:
    json.dump(cards, fp, ensure_ascii=False, indent=2)

print(f"Wrote {len(cards)} cards to {OUT}")
