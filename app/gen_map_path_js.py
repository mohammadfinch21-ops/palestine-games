import json
import os

APP = os.path.dirname(os.path.abspath(__file__))
p = json.load(open(os.path.join(APP, "_map_path.json"), encoding="utf-8"))
lines = [
    '/** Map token positions (percent) — extracted from الخارطة.pdf */',
    'export const MAP_IMAGE = "assets/map-board.jpg";',
    "export const MAP_PATH = {",
]
for k in sorted(p, key=int):
    v = p[k]
    lines.append(f"  {k}: {{ x: {v['x']}, y: {v['y']} }},")
lines.extend([
    "};",
    "",
    "export function getMapPosition(square) {",
    "  return MAP_PATH[square] || MAP_PATH[1];",
    "}",
])
out = os.path.join(APP, "js", "map-path-data.js")
with open(out, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
print(f"wrote {out}")
