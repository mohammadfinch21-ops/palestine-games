"""
Classify question cards vs cover/branding cards and update question-cards-data.json.
Run: python filter_question_cards.py
"""
import json
import os
import re
import sys

APP = os.path.dirname(os.path.abspath(__file__))
OUT_JSON = os.path.join(APP, "js", "question-cards-data.json")
LOG_PATH = os.path.join(APP, "filter-question-cards-log.txt")

Q_BOX = (0.10, 0.16, 0.90, 0.44)

COVER_QUESTION_RE = re.compile(
    r"و ة با|30;136|/85!|٥٥ت٥٥|9٦٥8ه|5٥7 073|188100",
)
COVER_MARKERS = (
    "لعبة قطار",
    "بطاقات التحرك",
    "scout4pal",
    "الإئتلاف",
    "الائتلاف",
)
STAGE_COVER_MARKERS = (
    "مرحلة الأشبال",
    "مرحلة الاشبال",
    "المرحلة الأولى أشبال",
    "المرحلة الثانية كشاف",
    "المرحلة الثالثة جوالة",
    "مرحلة المتقدم",
    "Global Scout Coalition",
    "Quds and Palestine",
    "للتواصل معنا",
    "لنصرة القدس",
)
ALL_COVER_MARKERS = COVER_MARKERS + STAGE_COVER_MARKERS

# PDF pages that are section cover/branding grids (no playable cards)
COVER_PAGES = {2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38}
COVER_ANSWER_MARKERS = (
    "لعبة قطار",
    "لعبة قار فلس",
    "scout4pal",
)
QUESTION_INDICATORS = (
    "؟", "?", "صح", "خطأ", "خطا", "نقول", "نقون", "نقو", "كقول", "كقو",
    "لقول", "لقون", "اذكر", "من ", "ما ", "في اي", "في أي", "كم ", "هل ",
    "أين", "اين", "متى", "أو", " او ", "أم ", " ام ",
)


def crop_frac(pil, frac):
    w, h = pil.size
    return pil.crop((int(frac[0] * w), int(frac[1] * h), int(frac[2] * w), int(frac[3] * h)))


def is_cover_card_by_image(path):
    """Cover cards: solid purple/red in question area. Real cards: gray torn-paper background."""
    try:
        import numpy as np
        from PIL import Image
    except ImportError:
        return False

    if not os.path.isfile(path):
        return False

    img = Image.open(path).convert("RGB")
    crop = crop_frac(img, Q_BOX)
    arr = np.array(crop)
    r = arr[:, :, 0].astype(int)
    g = arr[:, :, 1].astype(int)
    b = arr[:, :, 2].astype(int)

    gray_mask = (abs(r - g) < 30) & (abs(g - b) < 30) & (r > 95) & (r < 225)
    purple_mask = (r > 70) & (b > 90) & (g < r * 0.72) & (b > g)
    red_mask = (r > 140) & (g < 90) & (b < 90)

    total = gray_mask.size
    gray_ratio = gray_mask.sum() / total
    purple_ratio = purple_mask.sum() / total
    red_ratio = red_mask.sum() / total

    if gray_ratio > 0.12:
        return False
    if purple_ratio > 0.45 and gray_ratio < 0.06:
        return True
    if red_ratio > 0.55 and gray_ratio < 0.06:
        return True
    return purple_ratio > 0.30 and gray_ratio < 0.04


def arabic_ratio(text):
    if not text:
        return 0.0
    arabic = sum(1 for c in text if "\u0600" <= c <= "\u06FF" or c in "؟")
    return arabic / max(len(text), 1)


def has_playable_structure(card):
    from extract_card_text import has_valid_options, is_true_false_question

    question = card.get("question") or ""
    options = card.get("options") or []
    sc = card.get("stepsCorrect")
    sw = card.get("stepsWrong")
    if sc is None and sw is None:
        return False
    if not card.get("correctAnswer") or not str(card.get("correctAnswer")).strip():
        if is_true_false_question(question) or (options == ["صح", "خطأ"]):
            return True
        return False
    if len(options) < 2:
        if is_true_false_question(question):
            return True
        return False
    if not has_valid_options(question, options):
        if is_true_false_question(question):
            return True
        return False
    return True


def has_naqol_options(card):
    opts = card.get("options") or []
    if len(opts) != 2 or opts == ["صح", "خطأ"]:
        return False
    return all(len(str(o).strip()) > 2 for o in opts)


def looks_like_question_text(question, card=None):
    q = (question or "").strip()
    if len(q) < 10:
        return False
    if COVER_QUESTION_RE.search(q):
        return False
    if any(m in q for m in ALL_COVER_MARKERS):
        return False
    if arabic_ratio(q) < 0.30:
        return False
    if any(ind in q for ind in QUESTION_INDICATORS):
        return True
    if card and has_naqol_options(card):
        return True
    if len(q) >= 18 and arabic_ratio(q) >= 0.45:
        opts = (card or {}).get("options") or []
        if opts == ["صح", "خطأ"]:
            return True
    return False


def classify_card(card, use_image=True):
    """Return (is_question, reason)."""
    question = card.get("question") or ""
    answer = card.get("answer") or ""
    page = card.get("page") or 0

    if page in COVER_PAGES:
        return False, "cover_page"

    image_rel = card.get("image", "")
    image_path = os.path.join(APP, image_rel.replace("/", os.sep)) if image_rel else ""

    if use_image and image_path and is_cover_card_by_image(image_path):
        return False, "cover_image"

    if not question or len(question.strip()) < 8:
        return False, "empty_question"

    if COVER_QUESTION_RE.search(question):
        return False, "garbage_ocr"

    if any(m in question for m in ALL_COVER_MARKERS):
        return False, "cover_text_question"

    if any(m in answer for m in COVER_ANSWER_MARKERS):
        return False, "cover_text_answer"

    if not has_playable_structure(card):
        return False, "missing_structure"

    if looks_like_question_text(question, card):
        return True, "ok"

    return False, "not_question_shape"


def main():
    sys.path.insert(0, APP)
    from extract_card_text import enrich_card

    with open(OUT_JSON, encoding="utf-8") as f:
        cards = json.load(f)

    total = len(cards)
    kept = []
    removed = []
    reasons = {}

    for card in cards:
        enrich_card(card)
        is_q, reason = classify_card(card)
        card["isQuestionCard"] = is_q
        if not is_q:
            card["excludeReason"] = reason
            removed.append(card)
            reasons[reason] = reasons.get(reason, 0) + 1
        else:
            card.pop("excludeReason", None)
            kept.append(card)

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(cards, f, ensure_ascii=False, indent=2)

    log_lines = [
        f"Total cards: {total}",
        f"Playable (kept): {len(kept)}",
        f"Excluded (removed from play): {len(removed)}",
        "Exclusion reasons:",
    ]
    for reason, count in sorted(reasons.items(), key=lambda x: -x[1]):
        log_lines.append(f"  {reason}: {count}")
    log_lines.append("")
    log_lines.append("Sample excluded IDs:")
    for c in removed[:30]:
        log_lines.append(f"  {c['id']}: {c.get('excludeReason')} — {c.get('question', '')[:60]}")

    with open(LOG_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(log_lines))

    result = {
        "total": total,
        "playable": len(kept),
        "excluded": len(removed),
        "reasons": reasons,
        "log": LOG_PATH,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
