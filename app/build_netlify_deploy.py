"""
Build a slim Netlify drag-and-drop folder under 10 MB.
Does NOT modify source files — writes to netlify-deploy/ only.
"""
from __future__ import annotations

import json
import shutil
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "netlify-deploy"
LIMIT_MB = 10.0

# JPEG cards: max side length and quality (tuned for ~10 MB total)
JPEG_MAX_SIDE = 340
JPEG_QUALITY = 42
PNG_MAX_SIDE = 1400
MAP_JPEG_QUALITY = 68


def collect_referenced_assets() -> set[str]:
    refs: set[str] = set()
    for jf in ("js/question-cards-data.json", "js/memory-pairs-data.json"):
        data = json.loads((ROOT / jf).read_text(encoding="utf-8"))
        for item in data:
            for key in ("image", "imageAlt"):
                val = item.get(key)
                if val:
                    refs.add(val.replace("\\", "/"))

    refs.update(
        {
            "assets/map-board.jpg",
            "assets/logo.png",
            "assets/favicon-32.png",
            "assets/apple-touch-icon.png",
            "assets/logo-full.png",
        }
    )
    return refs


def copy_web_runtime() -> None:
    for name in ("index.html", "privacy.html", "netlify.toml", "robots.txt", "sitemap.xml"):
        src = ROOT / name
        if src.exists():
            shutil.copy2(src, OUT / name)

    # Slim deploy omits the 7 MB PDF — link to compressed map preview instead.
    index = OUT / "index.html"
    if index.exists():
        html = index.read_text(encoding="utf-8")
        html = html.replace('href="assets/الخارطة.pdf"', 'href="assets/map-board.jpg"')
        html = html.replace("📄 عرض الخارطة الأصلية (PDF)", "🗺️ عرض الخارطة (صورة)")
        html = html.replace("عرض الخارطة الأصلية (PDF)", "عرض الخارطة (صورة)")
        index.write_text(html, encoding="utf-8")

    for folder in ("css", "js"):
        dst = OUT / folder
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(ROOT / folder, dst)


def save_jpeg(img: Image.Image, dest: Path, quality: int) -> None:
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, "JPEG", quality=quality, optimize=True, progressive=True)


def resize_max(img: Image.Image, max_side: int) -> Image.Image:
    w, h = img.size
    if max(w, h) <= max_side:
        return img
    scale = max_side / max(w, h)
    return img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)


def compress_asset(rel: str) -> None:
    src = ROOT / rel.replace("/", "\\") if "\\" in str(ROOT) else ROOT / rel
    if not src.exists():
        print(f"  skip missing: {rel}")
        return

    dest = OUT / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    suffix = src.suffix.lower()

    if suffix in (".jpg", ".jpeg"):
        with Image.open(src) as im:
            im = resize_max(im, JPEG_MAX_SIDE)
            save_jpeg(im, dest.with_suffix(".jpeg"), JPEG_QUALITY)
        return

    if suffix == ".png":
        with Image.open(src) as im:
            if "map-board" in rel:
                im = resize_max(im, 1200)
            else:
                im = resize_max(im, PNG_MAX_SIDE)
            if im.mode in ("RGBA", "LA", "P"):
                im.save(dest, "PNG", optimize=True, compress_level=9)
            else:
                save_jpeg(im, dest.with_suffix(".jpg"), MAP_JPEG_QUALITY)
        return

    shutil.copy2(src, dest)


def folder_size_mb(path: Path) -> float:
    total = sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
    return total / 1024 / 1024


def main() -> int:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()

    refs = collect_referenced_assets()
    print(f"Copying web runtime...")
    copy_web_runtime()

    print(f"Compressing {len(refs)} referenced assets...")
    for rel in sorted(refs):
        compress_asset(rel)

    size = folder_size_mb(OUT)
    print(f"\nDeploy folder: {OUT}")
    print(f"Size: {size:.2f} MB (limit {LIMIT_MB} MB)")

    if size > LIMIT_MB:
        print(
            f"\nWARNING: Still over {LIMIT_MB} MB. "
            "Use Git-connected Netlify deploy (no drag-drop limit), "
            "or lower JPEG_QUALITY / JPEG_MAX_SIDE in this script.",
            file=sys.stderr,
        )
        return 1

    print("\nReady: drag the netlify-deploy/ folder to https://app.netlify.com/drop")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
