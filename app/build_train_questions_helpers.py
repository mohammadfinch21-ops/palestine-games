"""Helpers shared by build_train_questions.py and tests."""
import os
import re

APP = os.path.dirname(os.path.abspath(__file__))

from filter_question_cards import (  # noqa: E402
    COVER_MARKERS,
    COVER_ANSWER_MARKERS,
    COVER_PAGES,
    COVER_QUESTION_RE,
    is_cover_card_by_image,
    looks_like_question_text,
)
from extract_card_text import assign_scout_level  # noqa: E402

STAGE_COVER_MARKERS = (
    "مرحلة الأشبال",
    "مرحلة الاشبال",
    "المرحلة الأولى أشبال",
    "المرحلة الثانية كشاف",
    "المرحلة الثالثة جوالة",
    "مرحلة المتقدم",
    "Global Scout Coalition",
    "للتواصل معنا",
)

LEVEL_META = {
    "ashbal": ("yellow", "أشبال"),
    "scout": ("green", "كشاف"),
    "rover": ("red", "جوالة"),
    "advanced": ("brown", "المتقدم"),
}


def card_level_from_image(card):
    page = card.get("page") or 0

    if 15 <= page <= 22:
        color, name_ar = LEVEL_META["ashbal"]
        return "ashbal", color, name_ar
    if 23 <= page <= 30:
        color, name_ar = LEVEL_META["scout"]
        return "scout", color, name_ar
    if 31 <= page <= 34:
        color, name_ar = LEVEL_META["rover"]
        return "rover", color, name_ar
    if 35 <= page <= 38:
        color, name_ar = LEVEL_META["advanced"]
        return "advanced", color, name_ar

    if 1 <= page <= 14:
        image_rel = card.get("image", "")
        image_path = os.path.join(APP, image_rel.replace("/", os.sep)) if image_rel else ""
        if image_path and os.path.isfile(image_path):
            try:
                from PIL import Image

                border_color, level_id, name_ar = assign_scout_level(
                    Image.open(image_path).convert("RGB")
                )
                if level_id != "movement":
                    return level_id, border_color, name_ar
            except OSError:
                pass

    return None, None, None


def is_stage_cover(card):
    q = (card.get("question") or "").strip()
    page = card.get("page") or 0
    if page in COVER_PAGES:
        return True
    if COVER_QUESTION_RE.search(q):
        return True
    if any(m in q for m in STAGE_COVER_MARKERS + COVER_MARKERS):
        return True
    answer = card.get("answer") or ""
    if any(m in answer for m in COVER_ANSWER_MARKERS):
        return True
    image_rel = card.get("image", "")
    image_path = os.path.join(APP, image_rel.replace("/", os.sep)) if image_rel else ""
    if image_path and is_cover_card_by_image(image_path):
        return True
    return False


def normalize_card(card):
    q = (card.get("question") or "").strip()
    if not q or len(q) < 8 or is_stage_cover(card):
        return None
    if not looks_like_question_text(q, card) and not (card.get("answer") and len(card.get("answer")) > 2):
        return None
    return card
