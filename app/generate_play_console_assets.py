"""Generate Google Play Console developer profile images."""
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    import subprocess

    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow", "-q"])
    from PIL import Image, ImageDraw, ImageFont

try:
    import arabic_reshaper
    from bidi.algorithm import get_display

    HAS_BIDI = True
except ImportError:
    import subprocess

    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "arabic-reshaper", "python-bidi", "-q"]
    )
    import arabic_reshaper
    from bidi.algorithm import get_display

    HAS_BIDI = True

BASE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(BASE, "assets")
OUT = os.path.join(ASSETS, "play-console")
os.makedirs(OUT, exist_ok=True)

BRAND_GREEN = (26, 61, 46)  # #1a3d2e
TEXT_GREEN = (120, 200, 140)
WHITE = (255, 255, 255)

AR_LINE1 = "الائتلاف الكشفي العالمي"
AR_LINE2 = "لنصرة القدس وفلسطين"
EN_LINE1 = "The Global Scout Coalition"
EN_LINE2 = "for Quds and Palestine"
APP_LINE = "ألعاب فلسطين — القطار + بطاقات الذاكرة"


def ar(text):
    if HAS_BIDI:
        return get_display(arabic_reshaper.reshape(text))
    return text


def load_font(size, bold=False):
    candidates = [
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\tahomabd.ttf" if bold else r"C:\Windows\Fonts\tahoma.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
    ]
    for path in candidates:
        if os.path.isfile(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def save_under_1mb(img, path, max_bytes=1024 * 1024):
    """Save PNG/JPEG keeping file under Play Console 1 MB limit."""
    rgb = img.convert("RGB")
    rgb.save(path, format="PNG", optimize=True)
    if os.path.getsize(path) <= max_bytes:
        return path

    for quality in (92, 88, 84, 80, 76, 72):
        jpg = os.path.splitext(path)[0] + ".jpg"
        rgb.save(jpg, format="JPEG", quality=quality, optimize=True)
        if os.path.getsize(jpg) <= max_bytes:
            return jpg
    return jpg


def make_icon_512():
    src = os.path.join(ASSETS, "logo-square.png")
    if not os.path.isfile(src):
        src = os.path.join(ASSETS, "logo.png")
    icon = Image.open(src).convert("RGBA")
    if icon.size != (512, 512):
        canvas = Image.new("RGBA", (512, 512), BRAND_GREEN + (255,))
        scale = min(512 / icon.width, 512 / icon.height)
        w = int(icon.width * scale)
        h = int(icon.height * scale)
        resized = icon.resize((w, h), Image.Resampling.LANCZOS)
        canvas.paste(resized, ((512 - w) // 2, (512 - h) // 2), resized)
        icon = canvas
    out = os.path.join(OUT, "developer-icon-512.png")
    icon.convert("RGB").save(out, optimize=True)
    return out


def paste_emblem(canvas, emblem, center_x, center_y, max_side):
    emblem = emblem.copy()
    emblem.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    x = center_x - emblem.width // 2
    y = center_y - emblem.height // 2
    if emblem.mode == "RGBA":
        canvas.paste(emblem, (x, y), emblem)
    else:
        canvas.paste(emblem, (x, y))


def make_header_4096():
    w, h = 4096, 2304
    canvas = Image.new("RGB", (w, h), BRAND_GREEN)
    draw = ImageDraw.Draw(canvas)

    emblem = Image.open(os.path.join(ASSETS, "logo.png")).convert("RGBA")
    paste_emblem(canvas, emblem, w // 2, int(h * 0.34), int(h * 0.42))

    font_ar1 = load_font(118, bold=True)
    font_ar2 = load_font(96, bold=True)
    font_en1 = load_font(72)
    font_en2 = load_font(64)
    font_app = load_font(80, bold=True)

    y = int(h * 0.58)
    for text, font, color in (
        (ar(AR_LINE1), font_ar1, TEXT_GREEN),
        (ar(AR_LINE2), font_ar2, TEXT_GREEN),
        (EN_LINE1, font_en1, WHITE),
        (EN_LINE2, font_en2, WHITE),
        (ar(APP_LINE), font_app, (255, 220, 120)),
    ):
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        draw.text(((w - tw) // 2, y), text, font=font, fill=color)
        y += (bbox[3] - bbox[1]) + 36

    out_png = os.path.join(OUT, "developer-header-4096x2304.png")
    saved = save_under_1mb(canvas, out_png)
    return saved


if __name__ == "__main__":
    icon_path = make_icon_512()
    header_path = make_header_4096()
    print("OK icon:", icon_path, os.path.getsize(icon_path))
    print("OK header:", header_path, os.path.getsize(header_path))
