import json
import os

APP = os.path.dirname(os.path.abspath(__file__))
p = json.load(open(os.path.join(APP, "js", "map-path.json"), encoding="utf-8"))
lines = [
    "/** Token positions on map (% of board image) — from الخarطة.pdf */",
    'export const MAP_IMAGE = "assets/pdf-page-1-preview.png";',
    "export const MAP_PATH = {",
]
for k in sorted(p, key=int):
    v = p[k]
    lines.append(f"  {k}: {{ x: {v['x']}, y: {v['y']} }},")
lines += [
    "};",
    "",
    "export function getMapPosition(square) {",
    "  const n = Math.max(1, Math.min(100, Number(square) || 1));",
    "  return MAP_PATH[n] || MAP_PATH[1];",
    "}",
    "",
    "/** @alias getMapPosition — square 1 = start marker on map */",
    "export function getPathCoord(square) {",
    "  return getMapPosition(square);",
    "}",
]
out = os.path.join(APP, "js", "board-path-coords.js")
with open(out, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
print("wrote", out, len(p), "points")
