"""Audit train-questions-by-level.json for garbled text."""
import json
import os
import sys

APP = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, APP)

from validate_cards import is_playable_card  # noqa: E402
from extract_card_text import is_valid_option, is_valid_question, options_look_garbled  # noqa: E402

DECK = os.path.join(APP, "js", "train-questions-by-level.json")


def main():
    with open(DECK, encoding="utf-8") as f:
        deck = json.load(f)

    per_level = {}
    bad = []
    for lid, lv in deck.get("levels", {}).items():
        cards = lv.get("cards") or []
        valid = 0
        for c in cards:
            ok, reason = is_playable_card(c, allow_ocr=False)
            if ok:
                valid += 1
            else:
                bad.append({"id": c.get("id"), "level": lid, "reason": reason, "q": (c.get("question") or "")[:50]})
        per_level[lid] = {"total": len(cards), "valid": valid, "invalid": len(cards) - valid}

    print(json.dumps({"per_level": per_level, "invalid_count": len(bad), "samples": bad[:8]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
