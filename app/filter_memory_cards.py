"""
Classify memory cards by scout stage color, detect covers, filter Palestine content.
Run: python filter_memory_cards.py
"""
import json
import os
import re
import sys

APP = os.path.dirname(os.path.abspath(__file__))
MEM_DIR = os.path.join(APP, "assets", "images", "memory")
META_PATH = os.path.join(MEM_DIR, "cards-meta.json")
LOG_PATH = os.path.join(APP, "filter-memory-cards-log.txt")

# PDF pages that are entirely section cover/branding sheets
COVER_PAGES = {2, 4, 6, 8, 10, 12}

STAGES = {
    "yellow": {"stage": "ashbal", "stageNameArabic": "أشبال", "stageColor": "yellow"},
    "green": {"stage": "scout", "stageNameArabic": "كشاف", "stageColor": "green"},
    "brown": {"stage": "advanced", "stageNameArabic": "متقدم", "stageColor": "brown"},
    "red": {"stage": "rover", "stageNameArabic": "جوالة", "stageColor": "red"},
}

COVER_TEXT_MARKERS = (
    "بطاقات الذاكرة",
    "scout4pal",
    "الإئتلاف",
    "الائتلاف",
    "Global Scout Coalition",
    "للتواصل معنا",
    "لنصرة القدس",
    "مرحلة الأشبال",
    "مرحلة فتيان",
    "مرحلة الجوالة",
    "The Global Scout Coalition",
)

def detect_stage_color(img):
    """Return yellow|green|brown|red from border/background pixels."""
    import numpy as np

    arr = np.array(img.convert("RGB"))
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

    scores = {
        "yellow": ((r > 180) & (g > 160) & (b < 140) & (r > g) & (g > b)).sum(),
        "green": ((g > 120) & (g > r * 1.05) & (g > b * 1.05) & (r < 180)).sum(),
        "brown": ((r > 100) & (g > 60) & (g < r * 0.85) & (b < g * 0.9) & (r < 200)).sum(),
        "red": ((r > 150) & (g < 100) & (b < 100)).sum(),
    }
    return max(scores, key=scores.get)


def is_content_card_by_image(img):
    """Playable cards: brown site-name banner at bottom (Palestine landmark cards)."""
    import numpy as np

    arr = np.array(img.convert("RGB"))
    h, w = arr.shape[:2]
    photo_box = arr[int(h * 0.12) : int(h * 0.62), int(w * 0.12) : int(w * 0.88)]
    color_range = photo_box.max(axis=2) - photo_box.min(axis=2)
    photo_ratio = (color_range > 40).sum() / max(color_range.size, 1)

    banner = arr[int(h * 0.72) : int(h * 0.92), int(w * 0.08) : int(w * 0.92)]
    br = banner[:, :, 0].astype(float)
    bg = banner[:, :, 1].astype(float)
    bb = banner[:, :, 2].astype(float)
    brown_banner = ((br > 70) & (bg > 45) & (bg < br * 0.92) & (bb < bg)).sum() / max(banner.shape[0] * banner.shape[1], 1)

    if brown_banner > 0.55:
        return True
    return photo_ratio > 0.20 and brown_banner > 0.08


def is_cover_card_by_image(img):
    """Cover/branding cards: title block + contact info, no landmark photo."""
    import numpy as np

    if is_content_card_by_image(img):
        return False

    arr = np.array(img.convert("RGB"))
    h, w = arr.shape[:2]
    bottom = arr[int(h * 0.68) :, :, :]
    r, g, b = bottom[:, :, 0].astype(int), bottom[:, :, 1].astype(int), bottom[:, :, 2].astype(int)
    # Large stylized title: yellow letters with red outline
    title_pixels = (r > 180) & (g > 140) & (b < 120)
    title_ratio = title_pixels.sum() / max(bottom.shape[0] * bottom.shape[1], 1)

    mid = arr[int(h * 0.18) : int(h * 0.62), int(w * 0.08) : int(w * 0.92)]
    std = mid.std()
    if std < 35 and title_ratio > 0.02:
        return True
    if title_ratio > 0.04:
        return True
    return False


def classify_card_file(fname, ocr_text=""):
    m = re.match(r"card-p(\d+)-(\d+)\.", fname)
    if not m:
        return None
    page, idx = int(m.group(1)), int(m.group(2))
    path = os.path.join(MEM_DIR, fname)

    from PIL import Image

    img = Image.open(path)
    color = detect_stage_color(img)
    stage_info = STAGES.get(color, STAGES["yellow"])

    if page in COVER_PAGES:
        return {
            "file": fname,
            "page": page,
            "idx": idx,
            **stage_info,
            "isPlayable": False,
            "excludeReason": "cover_page",
        }

    cover_img = is_cover_card_by_image(img)
    content = is_content_card_by_image(img)

    if cover_img:
        return {
            "file": fname,
            "page": page,
            "idx": idx,
            **stage_info,
            "isPlayable": False,
            "excludeReason": "cover_card",
        }

    if not content:
        return {
            "file": fname,
            "page": page,
            "idx": idx,
            **stage_info,
            "isPlayable": False,
            "excludeReason": "non_content",
        }

    text = ocr_text or ""
    if any(marker in text for marker in COVER_TEXT_MARKERS):
        return {
            "file": fname,
            "page": page,
            "idx": idx,
            **stage_info,
            "isPlayable": False,
            "excludeReason": "cover_text",
        }

    return {
        "file": fname,
        "page": page,
        "idx": idx,
        **stage_info,
        "isPlayable": True,
        "isPalestine": True,
    }


def load_ocr_cache():
    cache_path = os.path.join(APP, "assets", "memory-cards-ocr.json")
    if os.path.isfile(cache_path):
        with open(cache_path, encoding="utf-8") as fh:
            return json.load(fh)
    return {}


def main():
    files = sorted([f for f in os.listdir(MEM_DIR) if re.match(r"card-p\d+-\d+\.", f)])
    ocr = load_ocr_cache()

    classified = []
    stats = {
        "total": len(files),
        "playable": 0,
        "excluded": 0,
        "by_stage": {s["stage"]: 0 for s in STAGES.values()},
        "exclude_reasons": {},
    }

    for fname in files:
        info = classify_card_file(fname, ocr.get(fname, ""))
        if info:
            classified.append(info)
            if info["isPlayable"]:
                stats["playable"] += 1
                stats["by_stage"][info["stage"]] += 1
            else:
                stats["excluded"] += 1
                reason = info.get("excludeReason", "unknown")
                stats["exclude_reasons"][reason] = stats["exclude_reasons"].get(reason, 0) + 1

    out_path = os.path.join(MEM_DIR, "cards-classified.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(classified, fh, ensure_ascii=False, indent=2)

    log_lines = [
        f"Total card images: {stats['total']}",
        f"Playable cards: {stats['playable']}",
        f"Excluded cards: {stats['excluded']}",
        "",
        "Playable by stage (card images, not pairs):",
    ]
    for stage_key in ("ashbal", "scout", "advanced", "rover"):
        name = next(s["stageNameArabic"] for s in STAGES.values() if s["stage"] == stage_key)
        log_lines.append(f"  {name} ({stage_key}): {stats['by_stage'][stage_key]}")
    log_lines.append("")
    log_lines.append("Exclusion reasons:")
    for reason, count in sorted(stats["exclude_reasons"].items(), key=lambda x: -x[1]):
        log_lines.append(f"  {reason}: {count}")

    with open(LOG_PATH, "w", encoding="utf-8") as fh:
        fh.write("\n".join(log_lines))

    print(json.dumps({**stats, "classified": out_path, "log": LOG_PATH}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
