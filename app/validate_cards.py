"""
Shared validation for question text and multiple-choice options.
Used by build_train_questions.py, filter_question_cards.py, and JS parity tests.
"""
import re

from extract_card_text import (
    COVER_QUESTION_RE,
    TF_PATTERN,
    KNOWN_CORRECT,
    KNOWN_OPTIONS,
    KNOWN_QUESTIONS,
    apply_known_question,
    clean_option_text,
    context_options_from_question,
    extract_options,
    fix_answer_ocr,
    fix_question_ocr,
    has_valid_options,
    is_true_false_question,
    is_tf_options,
    is_valid_option,
    is_valid_question,
    options_look_garbled,
    resolve_correct_answer,
    template_options,
)

QUESTION_GARBAGE_RE = re.compile(
    r"[<>|`\\]|"
    r"^\s*[\d٠-٩]{3,}\s*$|"
    r"30;136|/85!|٥٥ت٥٥|9٦٥8ه|5٥7\s*073|188100|"
    r"و\s*ة\s*با|لعبة\s*قطار|scout4pal|Global\s*Scout"
)
QUESTION_SPACED_RE = re.compile(
    r"(?:^|\s)([\u0600-\u06FF])(?:\s+[\u0600-\u06FF]){3,}"
)
QUESTION_INDICATORS = (
    "؟", "?", "صح", "خطأ", "خطا", "نقول", "نقون", "نقو", "كقول", "كقو",
    "اذكر", "من ", "ما ", "في اي", "في أي", "كم ", "هل ", "أين", "اين", "متى",
    "أو", " او ", "أم ", " ام ", "بحيرة", "مدن", "مدينة", "فلسطين",
)


def arabic_ratio(text):
    if not text:
        return 0.0
    arabic = sum(1 for c in text if "\u0600" <= c <= "\u06FF" or c in "؟")
    return arabic / max(len(text), 1)


def clean_question_text(text):
    """Strip OCR noise while keeping readable Arabic question."""
    q = re.sub(r"\s+", " ", (text or "").strip())
    q = re.sub(r"^[\[\(\{]+", "", q)
    q = re.sub(r"[\]\)\}]+$", "", q)
    q = re.sub(r"^[\d٠-٩\s\.؛;,\|]+", "", q)
    q = re.sub(r"صح\s*أ?م\s*خط\s*ا(?:ء)?", "صح أم خطأ", q, flags=re.I)
    q = re.sub(r"صح\s*أ?م\s*خط", "صح أم خطأ", q, flags=re.I)
    q = re.sub(r"صح\s*او\s*خط", "صح أو خطأ", q, flags=re.I)
    for junk in ("السؤال", "الخطوات", "الجواب"):
        q = q.replace(junk, "")
    return q.strip(" ?؟،,.")


def is_valid_arabic_text(text, min_len=8):
    """Readable Arabic question — delegates to strict is_valid_question."""
    return is_valid_question(text)


def normalize_tf_options(question, answer=None):
    """صح/خطأ cards always use exact options."""
    if not is_true_false_question(question):
        return None, None
    ans = fix_answer_ocr(answer or "")
    correct = "خطأ" if re.search(r"خط|خطا|خطأ", ans, re.I) else "صح"
    if re.search(r"^ذ[;>]?$", ans):
        correct = "صح"
    return ["صح", "خطأ"], correct


def resolve_card_options(card, reader=None, image_path=None, allow_ocr=True):
    """
    Best-effort options for a card: existing → TF → template → extract → context → OCR.
    Returns (options, correct) or ([], "").
    """
    card_id = card.get("id")
    question = fix_question_ocr(card.get("question") or "")
    known_q, known_opts, known_correct = apply_known_question(card_id, question)
    question = known_q
    answer = fix_answer_ocr(card.get("answer") or card.get("correctAnswer") or "")

    if known_opts and len(known_opts) >= 2 and not options_look_garbled(known_opts):
        correct = known_correct if known_correct in known_opts else known_opts[0]
        return known_opts, correct

    tf_opts, tf_correct = normalize_tf_options(question, answer)
    if tf_opts:
        return tf_opts, tf_correct

    tpl_opts, tpl_correct = template_options(question)
    if tpl_opts and not options_look_garbled(tpl_opts):
        return tpl_opts, tpl_correct or tpl_opts[0]

    if card_id in KNOWN_OPTIONS:
        opts = [fix_answer_ocr(o) for o in KNOWN_OPTIONS[card_id]]
        correct = fix_answer_ocr(KNOWN_CORRECT.get(card_id) or resolve_correct_answer(answer, opts, card_id, question))
        if correct in opts:
            return opts, correct

    existing = [fix_answer_ocr(o) for o in (card.get("options") or [])]
    existing = [o for o in existing if is_valid_option(o)]
    trust_existing = card_id in KNOWN_OPTIONS or card_id in KNOWN_QUESTIONS
    if trust_existing and len(existing) >= 2 and has_valid_options(question, existing):
        correct = fix_answer_ocr(card.get("correctAnswer") or resolve_correct_answer(answer, existing, card_id, question))
        if correct in existing:
            return existing, correct

    extracted = extract_options(
        question,
        card_id,
        reader=None,
        image_path=None,
        card_color=card.get("bgColor"),
    )
    extracted = [fix_answer_ocr(o) for o in extracted if is_valid_option(o)]
    if len(extracted) >= 2 and not options_look_garbled(extracted):
        correct = fix_answer_ocr(resolve_correct_answer(answer, extracted, card_id, question))
        if correct not in extracted:
            correct = extracted[0]
        return extracted, correct

    ctx_opts, ctx_correct = context_options_from_question(question, answer)
    if ctx_opts and not options_look_garbled(ctx_opts):
        return ctx_opts, ctx_correct or ctx_opts[0]

    if allow_ocr and reader and image_path:
        extracted = extract_options(
            question,
            card_id,
            reader=reader,
            image_path=image_path,
            card_color=card.get("bgColor"),
        )
        extracted = [fix_answer_ocr(o) for o in extracted if is_valid_option(o)]
        if len(extracted) >= 2 and not options_look_garbled(extracted):
            correct = fix_answer_ocr(resolve_correct_answer(answer, extracted, card_id, question))
            if correct not in extracted:
                correct = extracted[0]
            return extracted, correct

    return [], ""


def is_playable_card(card, reader=None, image_path=None, allow_ocr=True):
    """100% readable question + 2+ valid options."""
    question = fix_question_ocr(card.get("question") or "")
    if not is_valid_question(question):
        return False, "invalid_question"

    existing = card.get("options") or []
    correct = card.get("correctAnswer") or ""
    if (
        len(existing) >= 2
        and has_valid_options(question, existing)
        and is_valid_option(correct)
        and correct in existing
    ):
        if is_true_false_question(question) and existing != ["صح", "خطأ"]:
            return False, "invalid_tf_options"
        return True, None

    options, correct = resolve_card_options(
        card, reader=reader, image_path=image_path, allow_ocr=allow_ocr
    )
    if len(options) < 2:
        return False, "missing_options"
    if not has_valid_options(question, options):
        return False, "invalid_options"
    if is_true_false_question(question) and options != ["صح", "خطأ"]:
        return False, "invalid_tf_options"
    if not is_valid_option(correct):
        return False, "invalid_correct"
    if correct not in options:
        return False, "correct_not_in_options"
    return True, None


def validated_payload(card, level_id, color, name_ar, options, correct):
    is_tf = is_true_false_question(card.get("question", "")) or is_tf_options(options)
    known_q, _, _ = apply_known_question(card.get("id"), fix_question_ocr(card.get("question") or ""))
    question = known_q
    return {
        "id": card["id"],
        "level": level_id,
        "levelName": name_ar,
        "color": color,
        "question": clean_question_text(question),
        "options": options,
        "correctAnswer": correct,
        "stepsCorrect": card.get("stepsCorrect") if card.get("stepsCorrect") is not None else 3,
        "stepsWrong": card.get("stepsWrong") if card.get("stepsWrong") is not None else 1,
        "isTrueFalse": bool(is_tf),
        "validated": True,
    }
