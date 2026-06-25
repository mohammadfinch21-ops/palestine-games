"""Build memory-pairs-data.json from extracted card images with scout stage grouping."""
import hashlib
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
MEM_DIR = os.path.join(BASE, "assets", "images", "memory")
CLASSIFIED = os.path.join(MEM_DIR, "cards-classified.json")
OUT = os.path.join(BASE, "js", "memory-pairs-data.json")
LOG = os.path.join(BASE, "build-memory-pairs-log.txt")

STAGE_ORDER = ("ashbal", "scout", "advanced", "rover")


def file_hash(rel_path):
    full = os.path.join(BASE, rel_path.replace("/", os.sep))
    with open(full, "rb") as fh:
        return hashlib.md5(fh.read()).hexdigest()


def load_classified():
    if not os.path.isfile(CLASSIFIED):
        sys.path.insert(0, BASE)
        import filter_memory_cards

        filter_memory_cards.main()
    with open(CLASSIFIED, encoding="utf-8") as fh:
        rows = json.load(fh)
    return {row["file"]: row for row in rows}


def build_pairs():
    classified = load_classified()
    files = sorted([f for f in os.listdir(MEM_DIR) if re.match(r"card-p\d+-\d+\.", f)])

    page_cards = {}
    for f in files:
        m = re.match(r"card-p(\d+)-(\d+)\.", f)
        page, idx = m.group(1), int(m.group(2))
        page_cards.setdefault(page, []).append((idx, f))

    pairs = []
    stats = {
        "pairs_by_stage": {s: 0 for s in STAGE_ORDER},
        "excluded_pairs": 0,
        "deduped_pairs": 0,
        "exclude_reasons": {},
    }
    seen_keys = {s: set() for s in STAGE_ORDER}

    for page in sorted(page_cards.keys()):
        cards = sorted(page_cards[page], key=lambda x: x[0])
        for i in range(0, len(cards) - 1, 2):
            a_idx, a_file = cards[i]
            b_idx, b_file = cards[i + 1]
            a_info = classified.get(a_file, {})
            b_info = classified.get(b_file, {})

            if not a_info.get("isPlayable") or not b_info.get("isPlayable"):
                stats["excluded_pairs"] += 1
                reason = a_info.get("excludeReason") or b_info.get("excludeReason") or "not_playable"
                stats["exclude_reasons"][reason] = stats["exclude_reasons"].get(reason, 0) + 1
                continue

            stage = a_info.get("stage", "ashbal")
            if b_info.get("stage") and b_info["stage"] != stage:
                stage = a_info["stage"]

            image = f"assets/images/memory/{a_file}"
            match_key = file_hash(image)

            if match_key in seen_keys[stage]:
                stats["deduped_pairs"] += 1
                continue
            seen_keys[stage].add(match_key)

            pid = f"p{page}-{a_idx:02d}"
            pairs.append({
                "id": pid,
                "label": f"بطاقة {page}-{a_idx}",
                "image": image,
                "imageAlt": f"assets/images/memory/{b_file}",
                "matchKey": match_key,
                "stage": stage,
                "stageNameArabic": a_info.get("stageNameArabic"),
                "stageColor": a_info.get("stageColor"),
                "isPlayable": True,
            })
            stats["pairs_by_stage"][stage] += 1

    pairs.sort(key=lambda p: (STAGE_ORDER.index(p["stage"]), p["id"]))

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(pairs, fh, ensure_ascii=False, indent=2)

    stats["total_pairs"] = len(pairs)
    log_lines = [
        f"Wrote {len(pairs)} playable pairs to {OUT}",
        "",
        "Pairs by stage:",
    ]
    stage_names = {
        "ashbal": "أشبال",
        "scout": "كشاف",
        "advanced": "متقدم",
        "rover": "جوالة",
    }
    for stage in STAGE_ORDER:
        log_lines.append(f"  {stage_names[stage]} ({stage}): {stats['pairs_by_stage'][stage]}")
    log_lines.append(f"Excluded pairs: {stats['excluded_pairs']}")
    log_lines.append(f"Deduplicated pairs: {stats['deduped_pairs']}")
    if stats["exclude_reasons"]:
        log_lines.append("Pair exclusion reasons:")
        for reason, count in sorted(stats["exclude_reasons"].items(), key=lambda x: -x[1]):
            log_lines.append(f"  {reason}: {count}")

    with open(LOG, "w", encoding="utf-8") as fh:
        fh.write("\n".join(log_lines))

    print(json.dumps(stats, ensure_ascii=False, indent=2))
    return pairs, stats


if __name__ == "__main__":
    build_pairs()
