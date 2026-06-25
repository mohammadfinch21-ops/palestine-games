"""Extract logo from map PDF sidebar and generate app icon sizes."""
import io
import os
import sys

try:
    import fitz
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pymupdf", "pillow", "-q"])
    import fitz

try:
    from PIL import Image
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow", "-q"])
    from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
PDF = os.path.join(ROOT, "الخارطة.pdf")
if not os.path.isfile(PDF):
    PDF = os.path.join(BASE, "assets", "الخارطة.pdf")
OUT = os.path.join(BASE, "assets")
MOBILE_RES = os.path.join(ROOT, "mobile", "android", "app", "src", "main", "res")
IOS_ICON = os.path.join(
    ROOT, "mobile", "ios", "App", "App", "Assets.xcassets",
    "AppIcon.appiconset", "AppIcon-512@2x.png",
)
os.makedirs(OUT, exist_ok=True)

# PDF clip fractions — emblem sits in the upper-right of the left sidebar strip
EMBLEM_CLIP = (0.052, 0.004, 0.218, 0.142)
LOCKUP_CLIP = (0.052, 0.004, 0.218, 0.215)
RENDER_DPI = 300

logo_full_path = os.path.join(OUT, "logo-full.png")
logo_path = os.path.join(OUT, "logo.png")
logo_sq_path = os.path.join(OUT, "logo-square.png")

# Full emblem reference (white background) — preferred over PDF crop when present
REFERENCE_CANDIDATES = [
    os.path.join(OUT, "logo-reference.png"),
    os.path.join(
        os.path.dirname(BASE),
        ".cursor",
        "projects",
        "c-Users-Downloads",
        "assets",
        "c__Users__________AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_image-d186817a-f5ce-49b6-bf66-84402729372a.png",
    ),
    os.path.join(
        os.path.expanduser("~"),
        ".cursor",
        "projects",
        "c-Users-Downloads",
        "assets",
        "c__Users__________AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_image-d186817a-f5ce-49b6-bf66-84402729372a.png",
    ),
]
EMBLEM_UPSCALE = 540  # max side before square canvas — crisp at ~108px UI + retina


def clip_rect(page, fractions):
    rect = page.rect
    x0, y0, x1, y1 = fractions
    return fitz.Rect(
        rect.x0 + rect.width * x0,
        rect.y0 + rect.height * y0,
        rect.x0 + rect.width * x1,
        rect.y0 + rect.height * y1,
    )


def render_clip(page, fractions):
    pix = page.get_pixmap(dpi=RENDER_DPI, clip=clip_rect(page, fractions), alpha=False)
    return Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")


def remove_outer_white(img, threshold=248):
    """Flood-fill from edges — remove only connected white margins."""
    rgba = img.convert("RGBA")
    w, h = rgba.size
    pixels = rgba.load()
    seeds = []

    def is_bg(x, y):
        r, g, b, a = pixels[x, y]
        return a > 0 and r >= threshold and g >= threshold and b >= threshold

    for x in range(w):
        if is_bg(x, 0):
            seeds.append((x, 0))
        if is_bg(x, h - 1):
            seeds.append((x, h - 1))
    for y in range(h):
        if is_bg(0, y):
            seeds.append((0, y))
        if is_bg(w - 1, y):
            seeds.append((w - 1, y))

    stack = list(seeds)
    seen = set()
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or x < 0 or x >= w or y < 0 or y >= h:
            continue
        if not is_bg(x, y):
            continue
        seen.add((x, y))
        pixels[x, y] = (255, 255, 255, 0)
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    return rgba


def clean_white_fringe(img, threshold=238, passes=4):
    """Remove anti-aliased white halos still connected to transparent pixels."""
    rgba = img.convert("RGBA")
    pixels = rgba.load()
    w, h = rgba.size
    for _ in range(passes):
        changed = False
        for y in range(h):
            for x in range(w):
                r, g, b, a = pixels[x, y]
                if a == 0 or not (r >= threshold and g >= threshold and b >= threshold):
                    continue
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and pixels[nx, ny][3] == 0:
                        pixels[x, y] = (r, g, b, 0)
                        changed = True
                        break
        if not changed:
            break
    return rgba


def emblem_bbox_from_rgb(rgb):
    """Circular emblem only — yellow globe sets height, green+yellow sets width."""
    w, h = rgb.size
    pixels = rgb.load()

    yellow_rows = []
    for y in range(h):
        yellow_count = 0
        for x in range(w):
            r, g, b = pixels[x, y]
            if r > 180 and g > 140 and b < 120:
                yellow_count += 1
        if yellow_count > w * 0.02:
            yellow_rows.append(y)

    if not yellow_rows:
        return find_content_bbox(rgb)

    y0 = max(0, min(yellow_rows) - 24)
    globe_h = max(yellow_rows) - min(yellow_rows)
    y1 = min(h, max(yellow_rows) + int(globe_h * 0.32) + 24)

    xs, ys = [], []
    for y in range(y0, y1):
        for x in range(w):
            r, g, b = pixels[x, y]
            is_green = g > 120 and g > r and g > b and r < 200
            is_yellow = r > 180 and g > 140 and b < 120
            if is_green or is_yellow:
                xs.append(x)
                ys.append(y)

    if not xs:
        return find_content_bbox(rgb)

    pad = 16
    return (
        max(0, min(xs) - pad),
        max(0, min(ys) - pad),
        min(w, max(xs) + pad),
        min(h, max(ys) + pad),
    )


def find_content_bbox(img, threshold=248):
    """Bounding box of non-white pixels."""
    rgb = img.convert("RGB")
    pixels = rgb.load()
    w, h = rgb.size
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            r, g, b = pixels[x, y]
            if not (r >= threshold and g >= threshold and b >= threshold):
                xs.append(x)
                ys.append(y)
    if not xs:
        return (0, 0, w, h)
    pad = 10
    return (
        max(0, min(xs) - pad),
        max(0, min(ys) - pad),
        min(w, max(xs) + pad),
        min(h, max(ys) + pad),
    )


def trim_transparent(img):
    bbox = img.getbbox()
    if bbox:
        return img.crop(bbox)
    return img


def to_square_canvas(img, pad_ratio=0.04):
    side = int(max(img.width, img.height) * (1 + pad_ratio * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ox = (side - img.width) // 2
    oy = (side - img.height) // 2
    canvas.paste(img, (ox, oy), img)
    return canvas


def extract_emblem(page):
    """Full circular emblem (dome + rope knot) on transparent RGBA background."""
    raw = render_clip(page, EMBLEM_CLIP)
    bbox = emblem_bbox_from_rgb(raw)
    tight = raw.crop(bbox)
    emblem = remove_outer_white(tight)
    emblem = trim_transparent(emblem)
    return upscale_emblem(emblem)


def find_reference_image():
    for path in REFERENCE_CANDIDATES:
        if os.path.isfile(path):
            return path
    return None


def upscale_emblem(emblem):
    emblem = trim_transparent(emblem)
    scale = EMBLEM_UPSCALE / max(emblem.width, emblem.height)
    if scale > 1:
        emblem = emblem.resize(
            (int(emblem.width * scale), int(emblem.height * scale)),
            Image.Resampling.LANCZOS,
        )
    return to_square_canvas(emblem)


def emblem_from_reference(path):
    """Build transparent emblem from the full-logo reference (image 2)."""
    raw = Image.open(path).convert("RGB")
    emblem = remove_outer_white(raw)
    emblem = clean_white_fringe(emblem)
    emblem = trim_transparent(emblem)
    return upscale_emblem(emblem)


ref_path = find_reference_image()
if ref_path:
    emblem = emblem_from_reference(ref_path)
    emblem_source = f"reference:{ref_path}"
else:
    doc = fitz.open(PDF)
    page = doc[0]
    emblem = extract_emblem(page)
    doc.close()
    emblem_source = f"pdf:{PDF}"

doc = fitz.open(PDF)
page = doc[0]
lockup = render_clip(page, LOCKUP_CLIP)
doc.close()

# Full lockup (emblem + text) — outer white removed, for OG/social only
lockup_clean = remove_outer_white(lockup)
lockup_clean.save(logo_full_path, optimize=True)

emblem.save(logo_path, optimize=True)

icon_canvas = emblem.resize((512, 512), Image.Resampling.LANCZOS)
icon_canvas.save(logo_sq_path, optimize=True)

# App store icons need opaque background — brand green, not white
icon_opaque = Image.new("RGBA", (512, 512), (0, 92, 46, 255))
icon_opaque.paste(icon_canvas, (0, 0), icon_canvas)
square_rgb = icon_opaque.convert("RGB")


def save_icons(source):
    source.resize((32, 32), Image.Resampling.LANCZOS).save(
        os.path.join(OUT, "favicon-32.png")
    )
    source.resize((180, 180), Image.Resampling.LANCZOS).save(
        os.path.join(OUT, "apple-touch-icon.png")
    )

    android_sizes = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    for folder, px in android_sizes.items():
        d = os.path.join(MOBILE_RES, folder)
        os.makedirs(d, exist_ok=True)
        icon = source.resize((px, px), Image.Resampling.LANCZOS)
        icon.save(os.path.join(d, "ic_launcher.png"))
        icon.save(os.path.join(d, "ic_launcher_round.png"))
        fg_px = int(px * 432 / 108)
        fg = Image.new("RGBA", (fg_px, fg_px), (0, 0, 0, 0))
        inner = int(fg_px * 0.62)
        logo_fg = emblem.resize((inner, inner), Image.Resampling.LANCZOS)
        offset = (fg_px - inner) // 2
        fg.paste(logo_fg, (offset, offset), logo_fg)
        fg.save(os.path.join(d, "ic_launcher_foreground.png"))

    ios_dir = os.path.dirname(IOS_ICON)
    os.makedirs(ios_dir, exist_ok=True)
    source.resize((1024, 1024), Image.Resampling.LANCZOS).save(IOS_ICON)


save_icons(square_rgb)
print("emblem source:", emblem_source)
print("OK:", logo_full_path, lockup_clean.size)
print("OK:", logo_path, emblem.size)
print("OK:", logo_sq_path, os.path.getsize(logo_sq_path))
print("OK:", os.path.join(OUT, "favicon-32.png"))
print("OK:", os.path.join(OUT, "apple-touch-icon.png"))
