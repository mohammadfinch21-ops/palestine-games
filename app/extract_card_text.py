"""
Extract structured text from all question card images (784 cards).
Uses region-based OCR + template digit matching for steps.
"""
import os
import re
import sys
import json
import time
import argparse
import numpy as np
import cv2
from PIL import Image, ImageEnhance

APP = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(APP, "assets", "images", "questions")
OUT_JSON = os.path.join(APP, "js", "question-cards-data.json")
CACHE = os.path.join(APP, "assets", "question-cards-ocr-cache.json")

# Fractional crop regions (works for 598x764 and 597x763)
Q_BOX = (0.10, 0.16, 0.90, 0.44)
OPT_BOX = (0.06, 0.42, 0.94, 0.72)
OPTION_ROWS = (
    (0.06, 0.44, 0.94, 0.535),
    (0.06, 0.535, 0.94, 0.630),
    (0.06, 0.630, 0.94, 0.725),
)
A_BOX = (0.14, 0.76, 0.86, 0.91)
ROW_CORRECT = (0.06, 0.51, 0.94, 0.58)
ROW_WRONG = (0.06, 0.59, 0.94, 0.66)
OPT_JUNK_RE = re.compile(
    r"الخطوات|الجواب|الصحيح|الخط[أا]|scout|لعبة|footprint|^\d+$",
    re.I,
)
# Scout cards (yellow/green/brown): numbered options on right side
SCOUT_OPTION_ROWS = (
    (0.28, 0.44, 0.94, 0.535),
    (0.28, 0.535, 0.94, 0.630),
    (0.28, 0.630, 0.94, 0.725),
)
OCR_GARBAGE_CHARS_RE = re.compile(r"[<>|`'\\[\];_{}|+]")
SPACED_LETTERS_RE = re.compile(
    r"(?:^|\s)([\u0600-\u06FF\u0660-\u0669])(?:\s+[\u0600-\u06FF\u0660-\u0669]){2,}"
)
LATIN_OR_MIXED_RE = re.compile(
    r"[a-zA-Z]|"
    r"[\[\];_{}|\\+]|"
    r"[<>]|"
    r"\d(?=[^\d\s\u0600-\u06FF.,،؟?])|"
    r"(?<=[^\d\s\u0600-\u06FF])[\d٠-٩](?=[^\d\s\u0600-\u06FF])"
)
OCR_GARBAGE_FRAGMENTS = (
    "ادحر", "تللال", "ديئ", "فلسطب", "الأتز", "آيل", "سذر", "شلس",
    "1فه", "ا9", "د9 ", "م٧٥", "م سا", "5 ذا", ">0", "01920",
    "9ma", "كذi", "لقصى", "ؤضع", "اللرض", "التملة", "آ9ل",
    "صهبون", "القهب", "القهيون", "فلسطبن", "مدبنة", "القدبمة",
    "م لبعد", "آيل ", "سذرذ", "لبثان", "والظير", "خيذا",
    "م اع ", "جبل ميذ", "تجبل ", "قتقد", "الحسبن", "الحسبنى",
    "ائ معركة", "tarبخ", "فلسطبنية", "اللاجئ", "مخبم", "مخيم", "حترها", "تلطيل", "معاوبة", "وثباص", "اررقا", "ميها", "فرتئ", "دلعabd",
    "آحر", "مديه", "جىوب", "الشلط", "اللسم", "العذبة", "الخربطة", "المربب", "المعجر", "بعادل", "أجرال",
    "الديال", "الرسسم", "الذيانة", "الإسلامت", "أدمر", "داثري", "مريعي", "البا المات", "الأقصىء", "الجنوبيء",
    "الهدينة", "بطلق", "المعالب", "لرمل", "لوجد", "لرمر", "المسحد", "اللقص ", "خطاء ام",
)
OCR_TYPO_RE = re.compile(
    r"آحر|مديه|جىوب|\sمي\s|الشلط|اللسم|العذبة|الخربطة|المربب|المعجر|"
    r"بعادل\s*أجر|الديال[هة]|الرسسم|الذيانة|الإسلامت|أدمر|داثري|مريعي|"
    r"البا\s*المات|الأقصىء|الجنوبيء|الهدينة|بطلق|المعالب|"
    r"1\s*\.\s*0\s*194|لرمل|لوجد|لرمر|المسحد|اللقص\s|خط[اأ]ء\s*ام"
)
REPEATED_LETTER_RE = re.compile(r"([\u0600-\u06FF])\1{2,}")

# Seed templates: filename -> (stepsCorrect, stepsWrong)
SEED_DIGITS = {
    "q-p01-00.jpeg": (2, 1),
    "q-p01-01.jpeg": (6, 1),
    "q-p01-05.jpeg": (6, 1),
    "q-p02-00.jpeg": (3, 1),
    "q-p03-00.jpeg": (4, 1),
    "q-p04-00.jpeg": (5, 1),
}


def crop_frac(pil, frac):
    w, h = pil.size
    return pil.crop((int(frac[0] * w), int(frac[1] * h), int(frac[2] * w), int(frac[3] * h)))


def circle_roi_from_row(pil, row_frac):
    """Return binarized digit ROI from largest white blob in step row."""
    crop = crop_frac(pil, row_frac)
    gray = cv2.cvtColor(np.array(crop), cv2.COLOR_RGB2GRAY)
    _, th = cv2.threshold(gray, 170, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best = None
    best_area = 0
    for c in contours:
        area = cv2.contourArea(c)
        if area < 80:
            continue
        x, y, cw, ch = cv2.boundingRect(c)
        aspect = cw / max(ch, 1)
        if 0.4 < aspect < 2.5 and area > best_area:
            best_area = area
            best = (th[y : y + ch, x : x + cw], x, y, cw, ch)
    if not best:
        return None
    roi, *_ = best
    return cv2.resize(roi, (40, 40))


def build_digit_templates(reader):
    """Build 1-6 digit templates from seed cards."""
    templates = {d: [] for d in range(1, 7)}
    for fname, (sc, sw) in SEED_DIGITS.items():
        path = os.path.join(IMG_DIR, fname)
        if not os.path.isfile(path):
            continue
        img = Image.open(path).convert("RGB")
        rc = circle_roi_from_row(img, ROW_CORRECT)
        rw = circle_roi_from_row(img, ROW_WRONG)
        if rc is not None:
            templates[sc].append(rc)
        if rw is not None:
            templates[sw].append(rw)
    return templates


def match_digit(roi, templates):
    if roi is None:
        return None
    best, best_score = None, -1.0
    for digit, tpls in templates.items():
        for tpl in tpls:
            if tpl is None:
                continue
            score = cv2.matchTemplate(roi, tpl, cv2.TM_CCOEFF_NORMED)[0][0]
            if score > best_score:
                best_score = score
                best = digit
    return best if best_score > 0.35 else None


def ocr_digit(reader, roi):
    if roi is None:
        return None
    big = cv2.resize(roi, (160, 160), interpolation=cv2.INTER_CUBIC)
    results = reader.readtext(big, detail=0, allowlist="123456789")
    for t in results:
        m = re.search(r"[1-6]", t)
        if m:
            return int(m.group())
    return None


def read_step_digits(pil, reader, templates):
    rc = circle_roi_from_row(pil, ROW_CORRECT)
    rw = circle_roi_from_row(pil, ROW_WRONG)
    sc = ocr_digit(reader, rc) or match_digit(rc, templates)
    sw = ocr_digit(reader, rw) or match_digit(rw, templates)
    return sc, sw


def prep_question(arr):
    """Enhance red-on-gray question text."""
    if len(arr.shape) == 3:
        r = arr[:, :, 0].astype(float)
        g = arr[:, :, 1].astype(float)
        b = arr[:, :, 2].astype(float)
        red = np.clip(r - np.minimum(g, b) * 0.8, 0, 255).astype(np.uint8)
        img = Image.fromarray(red)
    else:
        img = Image.fromarray(arr)
    img = ImageEnhance.Contrast(img).enhance(2.8)
    return np.array(img.resize((img.width * 3, img.height * 3), Image.Resampling.LANCZOS))


def prep_answer(arr):
    """Enhance yellow-on-purple answer text."""
    if len(arr.shape) == 3:
        r = arr[:, :, 0].astype(float)
        g = arr[:, :, 1].astype(float)
        b = arr[:, :, 2].astype(float)
        yellow = np.clip((r + g) / 2 - b * 0.5, 0, 255).astype(np.uint8)
        img = Image.fromarray(yellow)
    else:
        img = Image.fromarray(arr)
    img = ImageEnhance.Contrast(img).enhance(3.0)
    return np.array(img.resize((img.width * 3, img.height * 3), Image.Resampling.LANCZOS))


def prep_options(arr):
    """Binarize white/yellow option text on red card background."""
    if len(arr.shape) == 3:
        gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
        _, bright = cv2.threshold(gray, 135, 255, cv2.THRESH_BINARY)
        img = Image.fromarray(bright)
    else:
        img = Image.fromarray(arr)
    img = ImageEnhance.Contrast(img).enhance(2.5)
    scale = 4
    return np.array(img.resize((img.width * scale, img.height * scale), Image.Resampling.LANCZOS))


def prep_options_scout(arr):
    """Dark text on yellow/green scout card background."""
    if len(arr.shape) == 3:
        gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
        _, dark = cv2.threshold(gray, 145, 255, cv2.THRESH_BINARY_INV)
        img = Image.fromarray(dark)
    else:
        img = Image.fromarray(arr)
    img = ImageEnhance.Contrast(img).enhance(2.8)
    scale = 4
    return np.array(img.resize((img.width * scale, img.height * scale), Image.Resampling.LANCZOS))


def detect_card_color(pil):
    """Return 'red' or 'purple' from the card body area."""
    mid = crop_frac(pil, (0.05, 0.45, 0.95, 0.70))
    arr = np.array(mid)
    r = arr[:, :, 0].astype(int)
    g = arr[:, :, 1].astype(int)
    b = arr[:, :, 2].astype(int)
    red_mask = (r > 140) & (g < 90) & (b < 90)
    purple_mask = (r > 70) & (b > 90) & (g < r * 0.72) & (b > g)
    red_ratio = red_mask.sum() / red_mask.size
    purple_ratio = purple_mask.sum() / purple_mask.size
    if red_ratio > purple_ratio and red_ratio > 0.15:
        return "red"
    return "purple"


SCOUT_LEVELS = {
    "yellow": ("ashbal", "أشبال"),
    "green": ("scout", "كشاف"),
    "red": ("rover", "جوالة"),
    "brown": ("advanced", "المتقدم"),
}


def detect_scout_level_color(pil):
    """Return yellow|green|brown|red|purple from card border pixels."""
    arr = np.array(pil.convert("RGB"))
    h, w = arr.shape[:2]
    margin = max(5, int(min(w, h) * 0.08))
    strips = [
        arr[:margin, :, :].reshape(-1, 3),
        arr[-margin:, :, :].reshape(-1, 3),
        arr[:, :margin, :].reshape(-1, 3),
        arr[:, -margin:, :].reshape(-1, 3),
    ]
    pixels = np.vstack(strips).astype(float)
    r, g, b = pixels[:, 0], pixels[:, 1], pixels[:, 2]
    total = max(len(r), 1)
    scores = {
        "yellow": ((r > 180) & (g > 160) & (b < 140) & (r > g) & (g > b)).sum() / total,
        "green": ((g > 120) & (g > r * 1.05) & (g > b * 1.05) & (r < 180)).sum() / total,
        "brown": ((r > 100) & (g > 60) & (g < r * 0.85) & (b < g * 0.9) & (r < 200)).sum() / total,
        "red": ((r > 150) & (g < 100) & (b < 100)).sum() / total,
        "purple": ((r > 70) & (b > 90) & (g < r * 0.72) & (b > g)).sum() / total,
    }
    best = max(scores, key=scores.get)
    if scores[best] < 0.06:
        return "purple"
    scout_best = max(("yellow", "green", "brown", "red"), key=lambda k: scores[k])
    if scores["purple"] >= scores[scout_best] * 0.85:
        return "purple"
    return scout_best


def assign_scout_level(pil):
    """Map border color to scout level id/name."""
    color = detect_scout_level_color(pil)
    if color in SCOUT_LEVELS:
        level_id, name_ar = SCOUT_LEVELS[color]
        return color, level_id, name_ar
    return "purple", "movement", "بطاقات التحرك"


def ocr_text(reader, pil, frac, prep_fn):
    crop = crop_frac(pil, frac)
    arr = prep_fn(np.array(crop))
    parts = reader.readtext(arr, detail=0, paragraph=True)
    return " ".join(parts).strip()


def clean_question(text):
    text = re.sub(r"\s+", " ", text or "")
    for junk in ("السؤال", "الخطوات", "الجواب", "صح أو خطأ", "صح او خطأ", "؟؟"):
        text = text.replace(junk, "")
    text = text.strip(" ?؟،,.")
    if text and not text.endswith("؟") and not text.endswith("?"):
        if "صح" in text or "خطأ" in text or "خطا" in text:
            if not text.endswith("؟"):
                text += "؟"
    return text


def clean_answer(text):
    text = re.sub(r"\s+", " ", text or "").strip(" ?؟،,.")
    for junk in ("الجواب", "؟", "?", ";", ">", "3", "0"):
        text = text.replace(junk, "")
    return text.strip()


# Verified from PDF for نقول cards where OCR answer is unreliable
KNOWN_OPTIONS = {
    "q-p01-01": ["مطالب فلسطينية", "حقوق فلسطينية"],
    "q-p01-02": ["جيش الاحتلال الصهيوني", "جيش الدفاع الإسرائيلي"],
    "q-p01-03": ["فلسطينيو الداخل", "عرب إسرائيل"],
    "q-p01-04": ["مطار بن غوريون", "مطار اللد"],
    "q-p01-05": ["القدس المحتلة", "القدس الشرقية/الغربية"],
    "q-p01-06": ["الحرم الشريف", "المسجد الأقصى المبارك"],
    "q-p01-07": ["بيسان", "بيت شان"],
    "q-p01-08": ["أشكلون", "عسقلان"],
    "q-p01-09": ["حائط البراق", "حائط المبكى"],
}

KNOWN_CORRECT = {
    "q-p01-01": "حقوق فلسطينية",
    "q-p01-02": "جيش الاحتلال الصهيوني",
    "q-p01-03": "فلسطينيو الداخل",
    "q-p01-04": "مطار اللد",
    "q-p01-05": "القدس المحتلة",
    "q-p01-06": "المسجد الأقصى المبارك",
    "q-p01-07": "بيسان",
    "q-p01-08": "عسقلان",
    "q-p01-09": "حائط البراق",
}

OR_SPLIT = re.compile(r"\s*(?:أو|او|آو|آ9|أ9|/9|٩|9١|أوب)\s*", re.I)
TF_PATTERN = re.compile(r"صح\s*(?:أو|ام|أم|او|ا|أ)?\s*خط", re.I)
NAQOL_PATTERN = re.compile(
    r"(?:نقول|نقون|نقو|كقول|كقو)\s+(.+?)\s*(?:أو|او|آو|آ9|أ9|/9|٩|9١|أوب)\s*(.+?)(?:\s*؟|\?|$)",
    re.I,
)


def clean_option_text(text):
    text = re.sub(r"\s+", " ", text or "").strip(" ?؟،,.")
    text = re.sub(r"\s*(?:لل\w+|الذ\w*|الث\w*)\s*$", "", text).strip()
    text = re.sub(r"^\d+[\.\)]\s*", "", text)
    text = text.strip(".")
    return text


def is_valid_option(text):
    """True when option text is readable Arabic (city, صح, خطأ, year, etc.)."""
    s = clean_option_text(str(text or ""))
    if not s:
        return False
    if s in ("صح", "خطأ"):
        return True
    if re.match(r"^(?:عام\s+)?[12]\d{3}$", s):
        return True
    if len(s) < 3:
        return False
    if OCR_GARBAGE_CHARS_RE.search(s):
        return False
    if s.endswith(">") or " >" in s or ">0" in s or ">" in s:
        return False
    if SPACED_LETTERS_RE.search(s):
        return False
    if LATIN_OR_MIXED_RE.search(s):
        return False
    if re.search(r"[a-zA-Z]", s):
        return False
    letters = re.findall(r"[\u0600-\u06FF]", s)
    if not letters:
        return bool(re.search(r"\d{4}", s))
    tokens = [t for t in re.split(r"\s+", s) if t]
    if tokens:
        short_tokens = sum(
            1 for t in tokens
            if len(re.sub(r"[^\u0600-\u06FF]", "", t)) <= 1
        )
        if short_tokens >= 1 and short_tokens >= len(tokens) * 0.34:
            return False
    for token in tokens:
        if re.match(r"^(?:عام\s+)?[12]\d{3}$", token):
            continue
        if re.search(r"[\d٠-٩]", token):
            return False
        if REPEATED_LETTER_RE.search(token):
            return False
        ar = len(re.findall(r"[\u0600-\u06FF]", token))
        if len(re.sub(r"[^\u0600-\u06FF]", "", token)) <= 2 and token not in SHORT_OPTION_WHITELIST:
            return False
        if len(token) >= 3 and ar < len(token) * 0.75:
            return False
    if any(g in s for g in OCR_GARBAGE_FRAGMENTS):
        return False
    if len(letters) < 4 and s not in SHORT_OPTION_WHITELIST:
        if not re.search(r"\d{4}", s):
            return False
    non_letter = sum(1 for c in s if c not in letters and not c.isspace())
    if non_letter > len(letters) and len(letters) < 4:
        return False
    if re.search(r"[-–—]$", s) or re.search(r"^[-–—]", s):
        return False
    if re.match(r"^[\d٠-٩\s\.]+$", s):
        return False
    return True


def is_valid_question(text):
    """Reject garbled OCR questions — spaced letters, nonsense, mixed digits."""
    raw = text or ""
    q = fix_question_ocr(raw)
    if len(q) < 8:
        return False
    is_tf = is_true_false_question(q) or is_true_false_question(raw)
    if is_tf:
        letters = len(re.findall(r"[\u0600-\u06FF]", q))
        if letters >= 8 and not OCR_GARBAGE_CHARS_RE.search(q):
            return True
    if len(q) < 10:
        return False
    if COVER_QUESTION_RE.search(q):
        return False
    if OCR_TYPO_RE.search(q):
        return False
    if OCR_GARBAGE_CHARS_RE.search(q):
        return False
    if SPACED_LETTERS_RE.search(q):
        return False
    if _arabic_ratio(q) < 0.48:
        return False
    is_tf = is_true_false_question(q)
    if LATIN_OR_MIXED_RE.search(q) and not is_tf:
        return False
    if re.search(r"[a-zA-Z]", q):
        return False
    if re.search(r"[؟?]\s*[\d١-٩0-9]|^\s*[\d١-٩0-9]\s+على", q):
        return False
    if re.search(r"^مل\s+الذي|^tar\b|تاربخ|المميم|المتوسطينية", q):
        return False
    if REPEATED_LETTER_RE.search(q):
        return False
    garbage_hits = sum(1 for g in OCR_GARBAGE_FRAGMENTS if g in q)
    if garbage_hits >= 1 and not is_tf:
        return False
    tokens = q.split()
    if tokens:
        single_char = sum(
            1 for t in tokens
            if len(re.sub(r"[^\u0600-\u06FF]", "", t)) <= 1 and t not in ("؟", "?")
        )
        if single_char >= 2:
            return False
        short = sum(1 for t in tokens if len(re.sub(r"[^\u0600-\u06FF]", "", t)) <= 2)
        if short >= 4 and short >= len(tokens) * 0.45 and not is_tf:
            return False
    digit_noise = len(re.findall(r"[\d٠-٩]", q))
    letters = len(re.findall(r"[\u0600-\u06FF]", q))
    if digit_noise >= 3 and digit_noise > letters * 0.12 and not is_tf:
        return False
    for token in tokens:
        if len(token) < 2:
            continue
        if re.search(r"[\d٠-٩]", token) and not re.match(r"^(?:عام\s+)?[12]\d{3}$", token):
            if not is_tf:
                return False
    if not any(ind in q for ind in QUESTION_INDICATORS):
        if is_tf:
            return letters >= 8
        return False
    return True


def is_valid_answer(text):
    return is_valid_option(text)


def fix_answer_ocr(text):
    """Fix common OCR misreads in answer/option text."""
    s = clean_option_text(text or "")
    fixes = {
        "طبربا": "طبريا",
        "طبربا.": "طبريا",
        "طبريه": "طبريا",
        "عكا.": "عكا",
        "غزة.": "غزة",
    }
    return fixes.get(s, s)


def is_true_false_question(question):
    return bool(TF_PATTERN.search(question or ""))


def is_tf_options(options):
    return options == ["صح", "خطأ"]


def has_valid_options(question, options):
    """True when options are usable for gameplay."""
    if not options or len(options) < 2:
        return False
    if is_tf_options(options) and not is_true_false_question(question):
        return False
    if options_look_garbled(options):
        return False
    return True


def options_look_garbled(options):
    if not options:
        return True
    return not all(is_valid_option(o) for o in options)


def clean_option_ocr(text):
    text = clean_option_text(text)
    text = text.replace("`", "").replace("|", "").replace("'", "")
    text = re.sub(r"^(\d{4})\b", r"عام \1", text)
    text = re.sub(r"\b(\d{4})\s+ف", r"عام \1 في", text)
    text = re.sub(r"\s+", " ", text).strip(" .،,")
    return text


# Verified from PDF when OCR question/options are unreliable
KNOWN_QUESTIONS = {
    "q-p01-01": {
        "question": "نقول مطالب فلسطينية أو حقوق فلسطينية؟",
        "options": ["مطالب فلسطينية", "حقوق فلسطينية"],
        "correctAnswer": "حقوق فلسطينية",
    },
    "q-p01-02": {
        "question": "نقول جيش الاحتلال الصهيوني أو جيش الدفاع الإسرائيلي؟",
        "options": ["جيش الاحتلال الصهيوني", "جيش الدفاع الإسرائيلي"],
        "correctAnswer": "جيش الاحتلال الصهيوني",
    },
    "q-p01-03": {
        "question": "نقول فلسطينيو الداخل أو عرب إسرائيل؟",
        "options": ["فلسطينيو الداخل", "عرب إسرائيل"],
        "correctAnswer": "فلسطينيو الداخل",
    },
    "q-p01-04": {
        "question": "نقول مطار بن غوريون أو مطار اللد؟",
        "options": ["مطار بن غوريون", "مطار اللد"],
        "correctAnswer": "مطار اللد",
    },
    "q-p01-05": {
        "question": "نقول القدس المحتلة أو القدس الشرقية/الغربية؟",
        "options": ["القدس المحتلة", "القدس الشرقية/الغربية"],
        "correctAnswer": "القدس المحتلة",
    },
    "q-p01-06": {
        "question": "نقول الحرم الشريف أو المسجد الأقصى المبارك؟",
        "options": ["الحرم الشريف", "المسجد الأقصى المبارك"],
        "correctAnswer": "المسجد الأقصى المبارك",
    },
    "q-p01-07": {
        "question": "نقول بيسان أو بيت شان؟",
        "options": ["بيسان", "بيت شان"],
        "correctAnswer": "بيسان",
    },
    "q-p01-08": {
        "question": "نقول أشكلون أو عسقلان؟",
        "options": ["أشكلون", "عسقلان"],
        "correctAnswer": "عسقلان",
    },
    "q-p01-09": {
        "question": "نقول حائط البراق أو حائط المبكى؟",
        "options": ["حائط البراق", "حائط المبكى"],
        "correctAnswer": "حائط البراق",
    },
    "q-p19-20": {
        "question": "اذكر ثلاثة معالم دينية في القدس",
        "options": ["المسجد الأقصى", "كنيسة القيامة", "حائط البراق", "جبل الهيكل"],
        "correctAnswer": "المسجد الأقصى",
    },
    "q-p31-06": {
        "question": "اذكر ثلاثة من مساجد المسجد الأقصى المبارك",
        "options": ["المسجد القبلي", "المسجد المرواني", "مسجد عمر", "قبة الصخرة"],
        "correctAnswer": "المسجد القبلي",
    },
    "q-p31-08": {
        "question": "اذكر ثلاث مدن فلسطينية على ساحل البحر المتوسط",
        "options": ["يافا", "عكا", "غزة", "حيفا"],
        "correctAnswer": "يافا",
    },
    "q-p31-04": {
        "question": "أين يقع مخيم عين الحلوة للاجئين الفلسطينيين؟",
        "options": ["لبنان", "سوريا", "الأردن", "مصر"],
        "correctAnswer": "لبنان",
    },
    "q-p31-07": {
        "question": "من أبا حامد الذي قتل والده خلال انتفاضة الأقصى عام 2000",
        "options": ["فارس عودة", "محمد الدرة", "إبراهيم سلامة", "عبد الرحمن"],
        "correctAnswer": "فارس عودة",
    },
    "q-p31-09": {
        "question": "من الذي أحرق المسجد الأقصى وفي أي تاريخ",
        "options": ["دينيس مايكل روهان", "باروخ غولدستين", "شارون", "يغال أمير"],
        "correctAnswer": "دينيس مايكل روهان",
    },
    "q-p15-00": {
        "question": "بحيرة تقع على حدود فلسطين، ما اسمها؟",
        "options": ["بحيرة القرعون", "بحيرة فكتوريا", "بحيرة طبريا"],
        "correctAnswer": "بحيرة طبريا",
    },
    "q-p21-14": {
        "question": "من أسس مدينة اللد",
        "options": ["هيرودس", "عمر بن الخطاب", "صلاح الدين", "سليمان القانوني"],
        "correctAnswer": "هيرودس",
    },
    "q-p15-11": {
        "question": "ما أكبر مدينة في جنوب فلسطين؟",
        "options": ["غزة", "عكا", "طبريا"],
        "correctAnswer": "طبريا",
    },
    "q-p31-13": {
        "question": "ما أرض المحشر والمنشر",
        "options": ["عرفات", "مزدلفة", "منى", "المدينة المنورة"],
        "correctAnswer": "عرفات",
    },
    "q-p33-03": {
        "question": "أين موقع دير القديس يوحنا المعمدان",
        "options": ["أريحا", "الناصرة", "بيت لحم", "القدس"],
        "correctAnswer": "أريحا",
    },
    "q-p15-02": {
        "question": "ما آخر مدينة في جنوب فلسطين؟",
        "options": ["مدينة الخليل", "مدينة جنين"],
        "correctAnswer": "مدينة الخليل",
    },
    "q-p15-10": {
        "question": "ما أشهر أعمال السلطان سليمان القانوني في القدس؟",
        "options": ["بناء سور مدينة", "بناء المصلى المرواني"],
        "correctAnswer": "بناء سور مدينة",
    },
    "q-p15-15": {
        "question": "كم مضاعف أجر الصلاة في المسجد الأقصى المبارك؟",
        "options": ["خمسمائة صلاة", "خمسمائة ألف صلاة"],
        "correctAnswer": "خمسمائة صلاة",
    },
    "q-p17-10": {
        "question": "ما الديانة الرسمية في فلسطين؟",
        "options": ["الإسلام", "الديانة اليهودية"],
        "correctAnswer": "الإسلام",
    },
    "q-p19-00": {
        "question": "البحيرة العذبة في فلسطين، ما الاسم الآخر لها؟",
        "options": ["بحر الجليل", "بحر الميت"],
        "correctAnswer": "بحر الجليل",
    },
    "q-p19-19": {
        "question": "متى حدثت نكبة فلسطين؟",
        "options": ["1948", "1967", "1940"],
        "correctAnswer": "1948",
    },
    "q-p19-22": {
        "question": "أين موقع مدينة بئر السبع؟",
        "options": ["النقب", "النقب الشمالي", "النقب الجنوبي"],
        "correctAnswer": "النقب",
    },
    "q-p21-08": {
        "question": "ما شكل فلسطين على الخريطة؟",
        "options": ["مثلثي", "مربعي"],
        "correctAnswer": "مثلثي",
    },
    "q-p21-12": {
        "question": "ما المعجزة المرتبطة بالمسجد الأقصى؟",
        "options": ["الإسراء والمعراج", "نزول القرآن الكريم"],
        "correctAnswer": "الإسراء والمعراج",
    },
    "q-p35-27": {
        "question": "أين موقع قرية كفر قاسم بالنسبة لفلسطين",
        "options": ["شمال فلسطين", "جنوب فلسطين", "شرق فلسطين", "غرب فلسطين"],
        "correctAnswer": "شمال فلسطين",
    },
    "q-p37-14": {
        "question": "اذكر ثلاث مدن فلسطينية جبلية",
        "options": ["نابلس", "الخليل", "جنين", "رام الله"],
        "correctAnswer": "نابلس",
    },
    "q-p15-13": {
        "question": "أين أرض المنشر والمحشر؟",
        "options": ["عرفات", "مزدلفة", "المدينة المنورة", "مكة"],
        "correctAnswer": "عرفات",
    },
    "q-p17-09": {
        "question": "كم تبلغ مساحة فلسطين تقريباً؟",
        "options": [
            "سبعة وعشرون ألف كيلومتر مربع",
            "خمسة عشر ألف كيلومتر مربع",
            "أربعون ألف كيلومتر مربع",
            "عشرة آلاف كيلومتر مربع",
        ],
        "correctAnswer": "سبعة وعشرون ألف كيلومتر مربع",
    },
    "q-p17-11": {
        "question": "ما ألوان العلم الفلسطيني؟",
        "options": [
            "أسود وأبيض وأخضر مع مثلث أحمر",
            "أخضر وأبيض وأسود فقط",
            "أحمر وأبيض وأسود فقط",
            "أزرق وأبيض وأخضر",
        ],
        "correctAnswer": "أسود وأبيض وأخضر مع مثلث أحمر",
    },
    "q-p23-12": {
        "question": "من الذي أحضر منبر نور الدين إلى المسجد الأقصى؟",
        "options": ["صلاح الدين الأيوبي", "عبد القادر الحسيني", "سليم الأول", "محمد علي باشا"],
        "correctAnswer": "صلاح الدين الأيوبي",
    },
    "q-p25-03": {
        "question": "كم سنة بقيت القدس في سلطة الدولة العثمانية؟",
        "options": ["أربعمائة سنة", "مائتا سنة", "ستمائة سنة", "مئة سنة"],
        "correctAnswer": "أربعمائة سنة",
    },
    "q-p25-04": {
        "question": "كم سنة استمر الحكم الإسلامي لفلسطين؟",
        "options": ["ثلاثة عشر قرناً", "خمسة قرون", "قرنان", "ألف سنة"],
        "correctAnswer": "ثلاثة عشر قرناً",
    },
    "q-p23-06": {
        "question": "ما ترتيب ألوان العلم الفلسطيني من الأعلى إلى الأسفل؟",
        "options": ["أسود ثم أبيض ثم أخضر", "أخضر ثم أبيض ثم أسود", "أحمر ثم أبيض ثم أسود", "أبيض ثم أسود ثم أخضر"],
        "correctAnswer": "أسود ثم أبيض ثم أخضر",
    },
    "q-p33-00": {
        "question": "اذكر خمس قبب للمسجد الأقصى المبارك",
        "options": ["قبة الصخرة", "قبة السلسلة", "قبة الخليل", "قبة المعراج", "قبة داود"],
        "correctAnswer": "قبة الصخرة",
    },
}

QUESTION_FIX_TEMPLATES = [
    (re.compile(r"ادحر\s*تل?ل?ال?ه?\s*معالم\s*د\w+\s*في\s*القدس", re.I), "اذكر ثلاثة معالم دينية في القدس"),
    (re.compile(r"ادحر\s*تل?ل?ال?ه?\s*من\s*مساجد\s*المسجد", re.I), "اذكر ثلاثة من مساجد المسجد الأقصى المبارك"),
    (re.compile(r"اذكر\s*ث?ل?ا?ت?\s*مدن\s*فلسط", re.I), "اذكر ثلاث مدن فلسطينية على ساحل البحر المتوسط"),
    (re.compile(r"صح\s*أ?م?\s*خط\s*ا", re.I), "صح أم خطأ"),
    (re.compile(r"صح\s*او\s*خط", re.I), "صح أو خطأ"),
    (re.compile(r"ما\s*آ?حر\s*مديه\s*مي\s*جى?وب", re.I), "ما آخر مدينة في جنوب فلسطين؟"),
    (re.compile(r"ما\s*أ?شهر\s*آ?عمال\s*الش?ل?طان", re.I), "ما أشهر أعمال السلطان سليمان القانوني في القدس؟"),
    (re.compile(r"كم\s*بعادل\s*أ?جر", re.I), "كم مضاعف أجر الصلاة في المسجد الأقصى المبارك؟"),
    (re.compile(r"ما\s*الديال[هة]\s*الرس?سم", re.I), "ما الديانة الرسمية في فلسطين؟"),
    (re.compile(r"العذبة\s*ف?ى?\s*فلسطين\s*ما\s*الل?سم", re.I), "البحيرة العذبة في فلسطين، ما الاسم الآخر لها؟"),
    (re.compile(r"ما\s*شكل\s*فلسطين\s*على\s*الخرب", re.I), "ما شكل فلسطين على الخريطة؟"),
    (re.compile(r"ما\s*المعجر\s*المربب", re.I), "ما المعجزة المرتبطة بالمسجد الأقصى؟"),
    (re.compile(r"ما\s*الهدينة\s*الفلسطينية", re.I), "ما المدينة الفلسطينية التي يُطلق عليها اسم دمشق الصغرى؟"),
]

QUESTION_OPTION_TEMPLATES = [
    (
        re.compile(r"عبد\s*القادر|الحسيني|الحسبن", re.I),
        re.compile(r"معرك", re.I),
        [
            "عام 1948 في معركة شعفاط",
            "عام 1113 في معركة الصنابرة",
            "عام 1948 في معركة القسطل",
        ],
        "عام 1948 في معركة القسطل",
    ),
    (
        re.compile(r"أكبر\s*مد(?:ن|ينة)\s*جنوب\s*فلسطين", re.I),
        None,
        ["غزة", "عكا", "طبريا"],
        "طبريا",
    ),
    (
        re.compile(r"بحيرة\s*تقع\s*على\s*حدود\s*فلسطين", re.I),
        None,
        ["بحيرة القرعون", "بحيرة فكتوريا", "بحيرة طبريا"],
        "بحيرة طبريا",
    ),
    (
        re.compile(r"ادحر|اذكر.*معالم.*(?:دين|دي).*(?:القدس|ف\s*القدس)", re.I),
        None,
        ["المسجد الأقصى", "كنيسة القيامة", "حائط البراق", "جبل الهيكل"],
        "المسجد الأقصى",
    ),
    (
        re.compile(r"ادحر|اذكر.*مساجد.*(?:الأقصى|الاقص)", re.I),
        None,
        ["المسجد القبلي", "مسجد عمر", "قبة الصخرة", "مسجد البراق"],
        "المسجد القبلي",
    ),
    (
        re.compile(r"اذكر.*مدن.*(?:ساحل|متوسط|بحر)", re.I),
        None,
        ["يافا", "عكا", "غزة", "حيفا"],
        "يافا",
    ),
    (
        re.compile(r"اذكر.*قب(?:ب|ب)\s*(?:ل)?(?:مسجد)?.*(?:أقص|اقص)", re.I),
        None,
        ["قبة الصخرة", "قبة السلسلة", "قبة الخليل", "قبة المعراج", "قبة داود"],
        "قبة الصخرة",
    ),
    (
        re.compile(r"النكبة\s*وفي\s*أي\s*سنة|ما\s*النكبة", re.I),
        None,
        ["1948", "1967", "1917", "1936"],
        "1948",
    ),
    (
        re.compile(r"النكسة\s*وفي\s*أي\s*سنة|ما\s*النكسة", re.I),
        None,
        ["1967", "1948", "1973", "1956"],
        "1967",
    ),
    (
        re.compile(r"مخيم\s*عين\s*الحلو", re.I),
        None,
        ["لبنان", "سوريا", "الأردن", "مصر"],
        "لبنان",
    ),
    (
        re.compile(r"مخيم\s*(?:ال)?(?:ب(?:ص|صص)|بص)", re.I),
        None,
        ["الأردن", "سوريا", "لبنان", "فلسطين"],
        "الأردن",
    ),
    (
        re.compile(r"عدد\s*مخيمات\s*اللاجئ", re.I),
        None,
        ["58", "27", "19", "12"],
        "58",
    ),
    (
        re.compile(r"وعد\s*بل(?:ف|ف)ور|بل(?:ف|ف)ور", re.I),
        None,
        ["1917", "1948", "1920", "1936"],
        "1917",
    ),
    (
        re.compile(r"ثورة\s*1936|تورة\s*1936|ثورة\s*عام\s*1936", re.I),
        None,
        ["1936", "1948", "1929", "1917"],
        "1936",
    ),
    (
        re.compile(r"عاصمة\s*فلسطين", re.I),
        None,
        ["القدس", "غزة", "رام الله", "يافا"],
        "القدس",
    ),
    (
        re.compile(r"أسوار\s*.*(?:القدس|مدينة\s*القدس)", re.I),
        None,
        ["سليمان القانوني", "عمر بن الخطاب", "صلاح الدين", "هيرودس"],
        "سليمان القانوني",
    ),
    (
        re.compile(r"فتح\s*مد(?:ين|ينة)?(?:تي)?|قيس(?:ار)?(?:ية|ية)?.*عسقل", re.I),
        None,
        ["عمرو بن العاص", "خالد بن الوليد", "أبو عبيدة", "سعد بن أبي وقاص"],
        "عمرو بن العاص",
    ),
    (
        re.compile(r"حرق\s*المسجد\s*الأقص", re.I),
        None,
        ["دينيس مايكل روهان عام 1969", "1967", "1948", "1929"],
        "دينيس مايكل روهان عام 1969",
    ),
    (
        re.compile(r"الهاغانا|الهاجانا", re.I),
        None,
        ["منظمة عسكرية صهيونية", "حزب سياسي", "جمعية خيرية", "جيش نظامي"],
        "منظمة عسكرية صهيونية",
    ),
    (
        re.compile(r"أرض\s*المحشر|المحشر\s*و(?:ال)?منشر", re.I),
        None,
        ["عرفات", "مزدلفة", "منى", "المدينة المنورة"],
        "عرفات",
    ),
    (
        re.compile(r"ال(?:غ|ق)ور|نهر\s*الأردن|ن(?:هل|هر)\s*الأردن", re.I),
        None,
        ["الغور", "النقب", "الجليل", "الساحل"],
        "الغور",
    ),
    (
        re.compile(r"الحركة\s*ال(?:ق|ك)(?:ه|ه)(?:ب|ب)(?:ون|ونة)", re.I),
        None,
        ["الحركة القومية العربية", "حزب البعث", "الإخوان المسلمين", "الحركة الوطنية"],
        "الحركة القومية العربية",
    ),
    (
        re.compile(r"مساحة\s*فلسطين|تبلغ\s*مساحة", re.I),
        None,
        [
            "سبعة وعشرون ألف كيلومتر مربع",
            "خمسة عشر ألف كيلومتر مربع",
            "أربعون ألف كيلومتر مربع",
            "عشرة آلاف كيلومتر مربع",
        ],
        "سبعة وعشرون ألف كيلومتر مربع",
    ),
    (
        re.compile(r"ألوان\s*العلم\s*الفلسطين", re.I),
        None,
        [
            "أسود وأبيض وأخضر مع مثلث أحمر",
            "أخضر وأبيض وأسود فقط",
            "أحمر وأبيض وأسود فقط",
            "أزرق وأبيض وأخضر",
        ],
        "أسود وأبيض وأخضر مع مثلث أحمر",
    ),
    (
        re.compile(r"منبر\s*نور\s*الدين", re.I),
        None,
        ["صلاح الدين الأيوبي", "عبد القادر الحسيني", "سليم الأول", "محمد علي باشا"],
        "صلاح الدين الأيوبي",
    ),
    (
        re.compile(r"العثمان(?:ية|ي)", re.I),
        re.compile(r"القدس", re.I),
        ["أربعمائة سنة", "مائتا سنة", "ستمائة سنة", "مئة سنة"],
        "أربعمائة سنة",
    ),
    (
        re.compile(r"الحكم\s*الإ?سلامي", re.I),
        None,
        ["ثلاثة عشر قرناً", "خمسة قرون", "قرنان", "ألف سنة"],
        "ثلاثة عشر قرناً",
    ),
    (
        re.compile(r"دمشق\s*الصغر", re.I),
        None,
        ["نابلس", "الخليل", "غزة", "يافا"],
        "نابلس",
    ),
]


def fix_question_ocr(text):
    """Fix common OCR misreads in question text."""
    q = clean_question(text or "")
    tokens = q.split()
    anchors = (
        "مصليات", "المسجد", "فلسطين", "اذكر", "ما", "من", "هل", "بحيرة",
        "مدن", "مدينة", "أين", "متى", "كم", "صح", "نقول", "لقول", "من هو",
        "من هي", "أكبر", "عدد", "وعد", "ثورة", "النكبة", "النكسة",
    )
    while tokens:
        t = tokens[0]
        ar = sum(1 for c in t if "\u0600" <= c <= "\u06FF")
        digits = sum(1 for c in t if c.isdigit() or c in "٠١٢٣٤٥٦٧٨٩")
        if any(a in t for a in anchors):
            break
        if ar >= 4 and digits <= max(1, ar // 3):
            break
        if ar <= 2 or (digits and ar <= digits + 1):
            tokens.pop(0)
            continue
        break
    q = " ".join(tokens)
    for pat, replacement in QUESTION_FIX_TEMPLATES:
        if pat.search(q):
            return replacement
    fixes = {
        "طبربا": "طبريا",
        "فلسطبن": "فلسطين",
        "فلسطبنية": "فلسطينية",
        "اللاجئ": "اللاجئين",
        "مخبم": "مخيم",
        "آيل": "أين",
        "آين": "أين",
        "اين": "أين",
        "صحأم": "صح أم",
        "صح ام": "صح أم",
    }
    for bad, good in fixes.items():
        q = q.replace(bad, good)
    return q.strip()


def apply_known_question(card_id, question):
    """Return (question, options, correct) from KNOWN_QUESTIONS if available."""
    known = KNOWN_QUESTIONS.get(card_id)
    if not known:
        return question, None, None
    return (
        known.get("question", question),
        list(known.get("options") or []),
        known.get("correctAnswer", ""),
    )

PALESTINIAN_CITIES = [
    "القدس", "غزة", "نابلس", "رام الله", "حيفا", "يافا", "الخليل",
    "جنين", "طبريا", "بيسان", "عكا", "بئر السبع", "اللد", "الرملة",
    "سدير", "أريحا", "قلقيلية", "طولكرم", "الناصرة", "صفد",
]
SHORT_OPTION_WHITELIST = frozenset(PALESTINIAN_CITIES + ["صح", "خطأ", "1948", "1967", "1917", "1936"])

_question_options_cache = {}


def template_options(question):
    q = question or ""
    for q_pat, opt_pat, opts, correct in QUESTION_OPTION_TEMPLATES:
        if not q_pat.search(q):
            continue
        if opt_pat is not None and not opt_pat.search(q):
            continue
        return list(opts), correct
    return None, None


def context_options_from_question(question, answer=None):
    """Build options from question context when OCR fails (cities, lakes, etc.)."""
    q = question or ""
    ans = fix_answer_ocr(answer or "")

    if re.search(r"مد(?:ن|ينة)|مدن\s*فلسط", q, re.I):
        pool = list(PALESTINIAN_CITIES)
        correct = ans if is_valid_option(ans) else None
        if not correct:
            for city in pool:
                if city in q:
                    correct = city
                    break
        if not correct:
            return None, None
        distractors = [c for c in pool if c != correct][:3]
        opts = [correct] + distractors
        return opts, correct

    if re.search(r"بحيرة", q, re.I):
        lakes = ["بحيرة طبريا", "بحيرة القرعون", "بحيرة فكتوريا", "بحيرة ميت"]
        correct = ans if is_valid_option(ans) else "بحيرة طبريا"
        if "طبريا" in q or "طبربا" in (answer or ""):
            correct = "بحيرة طبريا"
        distractors = [lk for lk in lakes if lk != correct][:2]
        return [correct] + distractors, correct

    return None, None


def _ocr_option_rows(reader, pil, row_fracs, prep_fn):
    """OCR one text line per crop row; keep only valid options."""
    lines = []
    for row_frac in row_fracs:
        crop = crop_frac(pil, row_frac)
        arr = prep_fn(np.array(crop))
        parts = reader.readtext(arr, detail=0, paragraph=True)
        text = fix_answer_ocr(clean_option_ocr(" ".join(parts)))
        if not text or len(text) < 2:
            continue
        if OPT_JUNK_RE.search(text):
            continue
        if not is_valid_option(text):
            continue
        if text not in lines:
            lines.append(text)
    return lines


def ocr_options_from_image(reader, pil, card_style="red"):
    """OCR multiple-choice options — red cards (horizontal) or scout cards (numbered rows)."""
    if card_style == "scout":
        row_fracs = SCOUT_OPTION_ROWS
        prep_fn = prep_options_scout
    else:
        row_fracs = OPTION_ROWS
        prep_fn = prep_options

    lines = _ocr_option_rows(reader, pil, row_fracs, prep_fn)
    if len(lines) >= 2:
        return lines[:4]

    crop = crop_frac(pil, OPT_BOX)
    arr = prep_fn(np.array(crop))
    results = reader.readtext(arr, detail=1, paragraph=False)
    results.sort(key=lambda r: (r[0][0][1] + r[0][2][1]) / 2)
    for _bbox, text, _conf in results:
        text = fix_answer_ocr(clean_option_ocr(text))
        if not text or len(text) < 2 or OPT_JUNK_RE.search(text):
            continue
        if not is_valid_option(text):
            continue
        if text not in lines:
            lines.append(text)
    return lines[:4] if len(lines) >= 2 else None


def extract_options(question, card_id=None, reader=None, image_path=None, card_color=None):
    """Derive multiple-choice options — never default to صح/خطأ unless TF question."""
    if card_id and card_id in KNOWN_OPTIONS:
        return list(KNOWN_OPTIONS[card_id])

    q = (question or "").strip()
    q_key = re.sub(r"\s+", " ", q)[:100]
    if q_key in _question_options_cache:
        return list(_question_options_cache[q_key])

    if is_true_false_question(q):
        return ["صح", "خطأ"]

    tpl_opts, _tpl_correct = template_options(q)
    if tpl_opts:
        _question_options_cache[q_key] = tpl_opts
        return tpl_opts

    m = NAQOL_PATTERN.search(q)
    if m:
        opt1 = clean_option_text(m.group(1))
        opt2 = clean_option_text(m.group(2))
        if opt1 and opt2:
            opts = [opt1, opt2]
            _question_options_cache[q_key] = opts
            return opts

    parts = OR_SPLIT.split(q, maxsplit=1)
    if len(parts) == 2:
        left = clean_option_text(re.sub(r"^(?:نقول|نقون|نقو|كقول|كقو)\s+", "", parts[0], flags=re.I))
        right = clean_option_text(parts[1])
        if left and right and len(left) > 2 and len(right) > 2:
            opts = [left, right]
            _question_options_cache[q_key] = opts
            return opts

    ctx_opts, _ctx_correct = context_options_from_question(q)
    if ctx_opts and not options_look_garbled(ctx_opts):
        _question_options_cache[q_key] = ctx_opts
        return ctx_opts

    if reader and image_path and os.path.isfile(image_path):
        pil = Image.open(image_path).convert("RGB")
        color = card_color or detect_card_color(pil)
        border = detect_scout_level_color(pil)
        if color == "red":
            opts = ocr_options_from_image(reader, pil, card_style="red")
        elif border in ("yellow", "green", "brown"):
            opts = ocr_options_from_image(reader, pil, card_style="scout")
        else:
            opts = ocr_options_from_image(reader, pil, card_style="scout")
        if opts and not options_look_garbled(opts):
            _question_options_cache[q_key] = opts
            return opts

    return []


def normalize_tf_answer(answer):
    raw = clean_answer(answer)
    if not raw:
        return "صح"
    if raw == "صح":
        return "صح"
    if re.search(r"خط|خطا|خطأ", raw, re.I):
        return "خطأ"
    # OCR: yellow «صح» often reads as «ذ;» or «ذ»
    if re.search(r"^ذ[;>]?$", raw):
        return "صح"
    if re.search(r"اخ\s*تنا", raw, re.I):
        return "خطأ"
    if re.search(r"ذا|٥\s*ذ", raw):
        return "خطأ"
    if re.search(r"^ا", raw):
        return "صح"
    return "صح"


def _option_match_score(answer, option):
    a = clean_answer(answer)
    o = clean_option_text(option)
    if not a or not o:
        return 0
    if a == o or a in o or o in a:
        return 100
    years_a = set(re.findall(r"[12]\d{3}", a))
    years_o = set(re.findall(r"[12]\d{3}", o))
    score = len(years_a & years_o) * 30
    a_words = {w for w in re.split(r"\s+", a) if len(w) > 2}
    o_words = {w for w in re.split(r"\s+", o) if len(w) > 2}
    score += len(a_words & o_words) * 15
    for word in a_words:
        if len(word) > 3 and word in o:
            score += 12
    return score


def resolve_correct_answer(answer, options, card_id=None, question=None):
    if card_id and card_id in KNOWN_CORRECT:
        return KNOWN_CORRECT[card_id]

    _tpl_opts, tpl_correct = template_options(question or "")
    if tpl_correct and options and tpl_correct in options:
        return tpl_correct

    if not options:
        return clean_answer(answer) or "صح"

    if options == ["صح", "خطأ"]:
        return normalize_tf_answer(answer)

    best = options[0]
    best_score = -1
    for opt in options:
        score = _option_match_score(answer, opt)
        if score > best_score:
            best_score = score
            best = opt
    return best


def enrich_card(card, reader=None):
    """Add options, correctAnswer, bgColor fields to a card dict."""
    card_id = card.get("id")
    question = fix_question_ocr(card.get("question", ""))
    known_q, known_opts, known_correct = apply_known_question(card_id, question)
    question = known_q
    card["question"] = question
    answer = card.get("answer", "")
    sc = card.get("stepsCorrect")
    sw = card.get("stepsWrong")
    image_path = os.path.join(APP, card.get("image", "").replace("/", os.sep)) if card.get("image") else None
    if not image_path or not os.path.isfile(image_path):
        image_path = os.path.join(IMG_DIR, f"{card_id}.jpeg")

    card_color = card.get("bgColor")
    pil_for_level = None
    if os.path.isfile(image_path):
        try:
            pil_for_level = Image.open(image_path).convert("RGB")
            card_color = detect_card_color(pil_for_level)
            card["bgColor"] = card_color
            border_color, level_id, level_name = assign_scout_level(pil_for_level)
            card["borderColor"] = border_color
            card["level"] = level_id
            card["levelName"] = level_name
            card["color"] = border_color
        except OSError:
            pass

    card["isTrueFalse"] = is_true_false_question(question) or is_tf_options(card.get("options") or [])

    if known_opts and len(known_opts) >= 2 and not options_look_garbled(known_opts):
        options = known_opts
        correct = known_correct or known_opts[0]
    else:
        existing = card.get("options") or []
        if has_valid_options(question, existing) and card.get("correctAnswer"):
            options = existing
        else:
            options = extract_options(
                question,
                card_id,
                reader=reader,
                image_path=image_path if os.path.isfile(image_path) else None,
                card_color=card_color,
            )
        answer = fix_answer_ocr(answer)
        card["answer"] = answer
        correct = resolve_correct_answer(answer, options, card_id, question) if options else ""
        correct = fix_answer_ocr(correct)

    if known_correct and known_correct in (known_opts or options):
        correct = known_correct

    card["options"] = [fix_answer_ocr(o) for o in options]
    card["correctAnswer"] = correct
    if correct and correct in options:
        card["correctAnswerIndex"] = options.index(correct)
    else:
        card["correctAnswerIndex"] = 0

    playable = (
        is_question_card(
            sc,
            sw,
            question,
            card.get("answer"),
            image_path if os.path.isfile(image_path) else None,
            card,
        )
        and is_valid_question(question)
        and has_valid_options(question, options)
        and bool(correct)
        and is_valid_option(correct)
    )
    card["isQuestionCard"] = playable
    if not playable and options and not has_valid_options(question, options):
        card["excludeReason"] = "invalid_options"
    elif not playable and not options:
        card["excludeReason"] = "missing_options"
    return card


def read_answer(reader, pil, question):
    """Read answer text; special handling for صح/خطأ cards."""
    is_tf = is_true_false_question(question)
    crop = crop_frac(pil, A_BOX)
    arr = prep_answer(np.array(crop))
    if is_tf:
        results = reader.readtext(arr, detail=0, allowlist="صحخطأ ")
        joined = " ".join(results)
        if "صح" in joined:
            return "صح"
        if "خط" in joined:
            return "خطأ"
    text = clean_answer(" ".join(reader.readtext(arr, detail=0, paragraph=True)))
    return text or ("—" if not is_tf else "صح")


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
COVER_ANSWER_MARKERS = ("لعبة قطار", "لعبة قار فلس", "scout4pal")
QUESTION_INDICATORS = (
    "؟", "?", "صح", "خطأ", "خطا", "نقول", "نقون", "نقو", "كقول", "كقو",
    "لقول", "لقون", "اذكر", "من ", "ما ", "في اي", "في أي", "كم ", "هل ",
    "أين", "اين", "متى", "أو", " او ", "أم ", " ام ",
)


def _has_naqol_options(card):
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
    if any(m in q for m in COVER_MARKERS):
        return False
    if _arabic_ratio(q) < 0.30:
        return False
    if any(ind in q for ind in QUESTION_INDICATORS):
        return True
    if card and _has_naqol_options(card):
        return True
    if len(q) >= 18 and _arabic_ratio(q) >= 0.45:
        opts = (card or {}).get("options") or []
        if opts == ["صح", "خطأ"]:
            return True
    return False


def _arabic_ratio(text):
    if not text:
        return 0.0
    arabic = sum(1 for c in text if "\u0600" <= c <= "\u06FF" or c in "؟")
    return arabic / max(len(text), 1)


def is_cover_card_by_image(path):
    """Cover/branding cards lack the gray question-paper area in the top region."""
    if not os.path.isfile(path):
        return False
    img = Image.open(path).convert("RGB")
    crop = crop_frac(img, Q_BOX)
    arr = np.array(crop)
    r = arr[:, :, 0].astype(int)
    g = arr[:, :, 1].astype(int)
    b = arr[:, :, 2].astype(int)
    gray_mask = (np.abs(r - g) < 30) & (np.abs(g - b) < 30) & (r > 95) & (r < 225)
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


def is_question_card(sc, sw, question, answer=None, image_path=None, card=None):
    """Filter cover/title pages that aren't playable cards."""
    if image_path and is_cover_card_by_image(image_path):
        return False
    if sc is None and sw is None:
        return False
    if not question or len(question) < 8:
        return False
    if COVER_QUESTION_RE.search(question or ""):
        return False
    if any(m in question for m in COVER_MARKERS):
        return False
    if answer and any(m in answer for m in COVER_ANSWER_MARKERS):
        return False
    return looks_like_question_text(question, card)


def extract_card(path, reader, templates):
    img = Image.open(path).convert("RGB")
    fname = os.path.basename(path)
    m = re.match(r"q-p(\d+)-(\d+)\.", fname)
    page = int(m.group(1)) if m else 0
    idx = int(m.group(2)) if m else 0

    question = clean_question(ocr_text(reader, img, Q_BOX, prep_question))
    answer = read_answer(reader, img, question)
    sc, sw = read_step_digits(img, reader, templates)

    card = {
        "id": f"q-p{page:02d}-{idx:02d}",
        "page": page,
        "index": idx,
        "source": "كرت لعبة قطار فلسطين.pdf",
        "question": question,
        "answer": answer,
        "stepsCorrect": sc if sc is not None else 3,
        "stepsWrong": sw if sw is not None else 1,
        "isQuestionCard": False,
    }
    return enrich_card(card, reader=reader)


def merge_with_existing(cards):
    """Preserve image paths from existing JSON if present."""
    old_by_id = {}
    if os.path.isfile(OUT_JSON):
        with open(OUT_JSON, encoding="utf-8") as f:
            for c in json.load(f):
                old_by_id[c["id"]] = c
    for c in cards:
        prev = old_by_id.get(c["id"], {})
        c["image"] = prev.get("image") or f"assets/images/questions/{c['id']}.jpeg"
    return cards


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="Process only N cards (0=all)")
    parser.add_argument("--resume", action="store_true", help="Resume from cache")
    parser.add_argument("--test", action="store_true", help="With --limit: write to test file only")
    parser.add_argument(
        "--enrich-only",
        action="store_true",
        help="Add options/correctAnswer to existing JSON without OCR",
    )
    args = parser.parse_args()

    if args.enrich_only:
        if not os.path.isfile(OUT_JSON):
            print(f"Missing {OUT_JSON}", file=sys.stderr)
            sys.exit(1)
        reader = None
        try:
            import easyocr
            print("Loading OCR for option extraction on red cards…")
            reader = easyocr.Reader(["ar"], gpu=False, verbose=False)
        except ImportError:
            print("easyocr not installed — bgColor only, text-based options", file=sys.stderr)

        with open(OUT_JSON, encoding="utf-8") as f:
            cards = json.load(f)

        needs_ocr = 0
        for c in cards:
            if has_valid_options(c.get("question", ""), c.get("options") or []):
                continue
            cid = c.get("id")
            img_p = os.path.join(APP, (c.get("image") or "").replace("/", os.sep))
            if not os.path.isfile(img_p):
                img_p = os.path.join(IMG_DIR, f"{cid}.jpeg")
            if os.path.isfile(img_p):
                needs_ocr += 1
        print(f"Cards needing option OCR: {needs_ocr}/{len(cards)}")

        for i, c in enumerate(cards):
            enrich_card(c, reader=reader)
            if reader and (i + 1) % 50 == 0:
                print(f"  enriched {i + 1}/{len(cards)}")
        with open(OUT_JSON, "w", encoding="utf-8") as f:
            json.dump(cards, f, ensure_ascii=False, indent=2)

        playable = [c for c in cards if c.get("isQuestionCard")]
        real_opts = sum(
            1 for c in playable
            if c.get("options") and (is_tf_options(c["options"]) == is_true_false_question(c.get("question", "")))
        )
        red_count = sum(1 for c in playable if c.get("bgColor") == "red")
        purple_count = sum(1 for c in playable if c.get("bgColor") == "purple")
        print(json.dumps({
            "total": len(cards),
            "playable": len(playable),
            "with_real_options": real_opts,
            "red_cards": red_count,
            "purple_cards": purple_count,
        }, ensure_ascii=False))
        return

    try:
        import easyocr
    except ImportError:
        print("Install easyocr: pip install easyocr", file=sys.stderr)
        sys.exit(1)

    all_files = sorted(
        f for f in os.listdir(IMG_DIR) if f.startswith("q-") and f.lower().endswith((".jpeg", ".jpg", ".png"))
    )
    files = all_files[: args.limit] if args.limit else all_files
    out_path = OUT_JSON
    if args.limit and args.test:
        out_path = os.path.join(APP, "_test-question-cards-data.json")

    cache = {}
    if os.path.isfile(CACHE):
        with open(CACHE, encoding="utf-8") as f:
            cache = json.load(f)

    print(f"Loading OCR engine… ({len(files)} to process, {len(all_files)} total)")
    reader = easyocr.Reader(["ar"], gpu=False, verbose=False)
    templates = build_digit_templates(reader)

    cards = []
    t0 = time.time()
    process_list = all_files if not args.limit or args.test else files

    def flush_output():
        deck = [cache[f] for f in all_files if f in cache]
        deck.sort(key=lambda c: (c["page"], c["index"]))
        deck = merge_with_existing(deck)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(deck, f, ensure_ascii=False, indent=2)

    for i, fname in enumerate(process_list):
        if args.resume and fname in cache:
            continue
        if args.limit and not args.test and fname not in files:
            continue
        path = os.path.join(IMG_DIR, fname)
        try:
            card = extract_card(path, reader, templates)
            cache[fname] = card
            cards.append(card)
        except Exception as e:
            print(f"  ERROR {fname}: {e}")
        if (i + 1) % 25 == 0:
            elapsed = time.time() - t0
            print(f"  {i+1}/{len(process_list)} ({elapsed:.0f}s)")
            with open(CACHE, "w", encoding="utf-8") as f:
                json.dump(cache, f, ensure_ascii=False, indent=2)
            flush_output()

    # Build full deck from cache for all image files
    cards = [cache[f] for f in all_files if f in cache]
    cards.sort(key=lambda c: (c["page"], c["index"]))
    cards = merge_with_existing(cards)

    playable = [c for c in cards if c.get("isQuestionCard", True)]
    with_text = sum(1 for c in cards if c.get("question") and len(c["question"]) >= 8)
    with_answer = sum(1 for c in cards if c.get("answer") and len(c["answer"]) >= 1)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(cards, f, ensure_ascii=False, indent=2)
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

    print(json.dumps({
        "total": len(cards),
        "playable": len(playable),
        "with_question_text": with_text,
        "with_answer_text": with_answer,
        "output": out_path,
        "elapsed_sec": round(time.time() - t0, 1),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
