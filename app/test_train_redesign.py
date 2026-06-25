"""Smoke test for train game redesign."""
import json
import os
import urllib.request

APP = os.path.dirname(os.path.abspath(__file__))
BASE = "http://localhost:8765"

checks = []


def ok(name, cond, detail=""):
    checks.append((name, cond, detail))
    status = "OK" if cond else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))


deck_path = os.path.join(APP, "js", "train-questions-by-level.json")
deck = json.load(open(deck_path, encoding="utf-8"))
ok("train deck exists", True)
for lid in ["ashbal", "scout", "rover", "advanced"]:
    n = len(deck["levels"][lid]["cards"])
    ok(f"level {lid}", n > 0, f"{n} cards")

coords = json.load(open(os.path.join(APP, "js", "map-path.json"), encoding="utf-8"))
ok("map path 100 squares", len(coords) == 100)

for rel in [
    "assets/pdf-page-1-preview.png",
    "js/board-path-coords.js",
    "js/train-game.js",
    "js/questions.js",
    "js/modal.js",
]:
    ok(rel, os.path.isfile(os.path.join(APP, rel.replace("/", os.sep))))

try:
    for path in ["index.html", "js/train-questions-by-level.json", "js/board-path-coords.js"]:
        r = urllib.request.urlopen(f"{BASE}/{path}", timeout=3)
        ok(f"HTTP {path}", r.status == 200)
except Exception as e:
    ok("HTTP server", False, str(e))

failed = [c for c in checks if not c[1]]
print("\n" + ("ALL PASSED" if not failed else f"{len(failed)} FAILED"))
raise SystemExit(1 if failed else 0)
