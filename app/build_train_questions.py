"""
Build train-questions-by-level.json from question-cards-data.json + OCR cache.
Only includes cards with 100% readable Arabic question + valid options.
Run: python build_train_questions.py
"""
import json
import os
import sys

APP = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(APP, "js", "question-cards-data.json")
CACHE = os.path.join(APP, "assets", "question-cards-ocr-cache.json")
OUT = os.path.join(APP, "js", "train-questions-by-level.json")
MANUAL = os.path.join(APP, "js", "train-questions-manual.json")
LOG = os.path.join(APP, "build-train-questions-log.txt")
IMG_DIR = os.path.join(APP, "assets", "images", "questions")

sys.path.insert(0, APP)
from build_train_questions_helpers import card_level_from_image, is_stage_cover, normalize_card  # noqa: E402
from validate_cards import (  # noqa: E402
    is_playable_card,
    is_valid_question,
    resolve_card_options,
    validated_payload,
)
from extract_card_text import fix_question_ocr, apply_known_question  # noqa: E402

LEVEL_ORDER = ["ashbal", "scout", "rover", "advanced"]
LEVEL_META = {
    "ashbal": ("yellow", "أشبال"),
    "scout": ("green", "كشاف"),
    "rover": ("red", "جوالة"),
    "advanced": ("brown", "المتقدم"),
}


def image_path_for(card):
    image_rel = card.get("image", "")
    if image_rel:
        p = os.path.join(APP, image_rel.replace("/", os.sep))
        if os.path.isfile(p):
            return p
    cid = card.get("id", "")
    p = os.path.join(IMG_DIR, f"{cid}.jpeg")
    return p if os.path.isfile(p) else None


def load_ocr_reader(use_ocr=False):
    if not use_ocr:
        return None
    try:
        import easyocr

        print("Loading OCR for cards missing options…")
        return easyocr.Reader(["ar"], gpu=False, verbose=False)
    except ImportError:
        print("easyocr not installed — using templates/context only", file=sys.stderr)
        return None


def main():
    use_ocr = "--ocr" in sys.argv
    with open(SRC, encoding="utf-8") as f:
        cards = json.load(f)

    cache = {}
    if os.path.isfile(CACHE):
        with open(CACHE, encoding="utf-8") as f:
            cache = json.load(f)

    by_id = {c["id"]: dict(c) for c in cards}
    for _fname, cached in cache.items():
        cid = cached.get("id")
        if cid and cid in by_id:
            for key in ("question", "answer", "stepsCorrect", "stepsWrong", "options", "correctAnswer"):
                val = cached.get(key)
                if val is not None and (not by_id[cid].get(key) or key in ("options", "correctAnswer")):
                    if key == "options" and by_id[cid].get("options"):
                        continue
                    by_id[cid][key] = val

    merged = list(by_id.values())
    reader = load_ocr_reader(use_ocr=use_ocr)
    ocr_needed = []

    levels = {
        lid: {"id": lid, "nameArabic": name, "color": color, "cards": []}
        for lid, (color, name) in LEVEL_META.items()
    }

    stats = {
        "source_total": len(merged),
        "candidates": 0,
        "total_playable": 0,
        "excluded": 0,
        "excluded_invalid_question": 0,
        "excluded_invalid_options": 0,
        "excluded_no_level": 0,
        "excluded_cover": 0,
        "excluded_duplicate": 0,
        "ashbal": 0,
        "scout": 0,
        "rover": 0,
        "advanced": 0,
    }
    seen_ids = set()
    seen_questions = {lid: set() for lid in LEVEL_ORDER}
    excluded_samples = []

    for card in merged:
        if is_stage_cover(card):
            stats["excluded_cover"] += 1
            continue

        card = normalize_card(card)
        if not card:
            stats["excluded_cover"] += 1
            continue

        card["question"] = apply_known_question(
            card.get("id"), fix_question_ocr(card.get("question", ""))
        )[0]
        stats["candidates"] += 1
        img_path = image_path_for(card)

        if not is_valid_question(card.get("question", "")):
            stats["excluded"] += 1
            stats["excluded_invalid_question"] += 1
            if len(excluded_samples) < 8:
                excluded_samples.append({"id": card["id"], "reason": "invalid_question", "q": card.get("question", "")[:60]})
            continue

        level_id, color, name_ar = card_level_from_image(card)
        if not level_id:
            stats["excluded_no_level"] += 1
            continue

        if card["id"] in seen_ids:
            continue

        options, correct = resolve_card_options(card, reader=None, image_path=None, allow_ocr=False)
        merged = {**card, "options": options, "correctAnswer": correct}
        playable, reason = is_playable_card(merged, allow_ocr=False)
        if not playable:
            if img_path:
                ocr_needed.append((card, img_path))
            stats["excluded"] += 1
            stats["excluded_invalid_options"] += 1
            if len(excluded_samples) < 12:
                excluded_samples.append({"id": card["id"], "reason": reason, "q": card.get("question", "")[:60]})
            continue

        seen_ids.add(card["id"])
        payload = validated_payload(card, level_id, color, name_ar, options, correct)
        qkey = payload["question"].strip()
        if qkey in seen_questions[level_id]:
            stats["excluded"] += 1
            stats["excluded_duplicate"] += 1
            continue
        seen_questions[level_id].add(qkey)
        levels[level_id]["cards"].append(payload)
        stats["total_playable"] += 1
        stats[level_id] += 1

    if ocr_needed and not reader and use_ocr:
        reader = load_ocr_reader(use_ocr=True)

    if reader and ocr_needed:
        print(f"OCR pass for {len(ocr_needed)} cards…")
        recovered = 0
        for card, img_path in ocr_needed:
            level_id, color, name_ar = card_level_from_image(card)
            if not level_id or card["id"] in seen_ids:
                continue
            options, correct = resolve_card_options(card, reader=reader, image_path=img_path, allow_ocr=True)
            if len(options) < 2:
                continue
            playable, _ = is_playable_card(
                {**card, "options": options, "correctAnswer": correct},
                reader=reader,
                image_path=img_path,
                allow_ocr=True,
            )
            if not playable:
                continue
            seen_ids.add(card["id"])
            payload = validated_payload(card, level_id, color, name_ar, options, correct)
            qkey = payload["question"].strip()
            if qkey in seen_questions[level_id]:
                continue
            seen_questions[level_id].add(qkey)
            levels[level_id]["cards"].append(payload)
            stats["total_playable"] += 1
            stats[level_id] += 1
            stats["excluded"] -= 1
            stats["excluded_invalid_options"] -= 1
            recovered += 1
        stats["ocr_recovered"] = recovered

    stats["excluded_samples"] = excluded_samples

    if os.path.isfile(MANUAL):
        with open(MANUAL, encoding="utf-8") as f:
            manual_data = json.load(f)
        manual_added = 0
        for card in manual_data.get("cards") or []:
            level_id = card.get("level")
            if level_id not in levels or card.get("id") in seen_ids:
                continue
            playable, _ = is_playable_card(card, allow_ocr=False)
            if not playable:
                continue
            qkey = (card.get("question") or "").strip()
            if qkey in seen_questions[level_id]:
                continue
            seen_ids.add(card["id"])
            seen_questions[level_id].add(qkey)
            levels[level_id]["cards"].append(card)
            stats["total_playable"] += 1
            stats[level_id] += 1
            manual_added += 1
        stats["manual_added"] = manual_added

    output = {
        "version": 3,
        "source": "كرت لعبة قطار فلسطين.pdf",
        "levelOrder": LEVEL_ORDER,
        "levels": levels,
        "stats": stats,
    }

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    with open(LOG, "w", encoding="utf-8") as f:
        f.write(json.dumps(stats, ensure_ascii=False, indent=2))

    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
