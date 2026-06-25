"""Generate Android splash logo + iOS splash images from app/assets/logo.png."""
import os
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow", "-q"])
    from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
LOGO = os.path.join(BASE, "assets", "logo.png")
LOGO_SQ = os.path.join(BASE, "assets", "logo-square.png")

ANDROID_DRAWABLE = os.path.join(
    ROOT, "mobile", "android", "app", "src", "main", "res", "drawable"
)
IOS_SPLASH = os.path.join(
    ROOT, "mobile", "ios", "App", "App", "Assets.xcassets", "Splash.imageset"
)

SPLASH_BG = (26, 61, 46)  # #1a3d2e


def load_logo():
    for path in (LOGO, LOGO_SQ):
        if os.path.isfile(path):
            return Image.open(path).convert("RGBA")
    print("ERROR: Run make_logo_assets.py first to create assets/logo.png")
    sys.exit(1)


def make_splash_canvas(size, logo, logo_scale=0.38):
    canvas = Image.new("RGB", (size, size), SPLASH_BG)
    side = int(size * logo_scale)
    logo_resized = logo.copy()
    logo_resized.thumbnail((side, side), Image.Resampling.LANCZOS)
    x = (size - logo_resized.width) // 2
    y = (size - logo_resized.height) // 2
    if logo_resized.mode == "RGBA":
        canvas.paste(logo_resized, (x, y), logo_resized)
    else:
        canvas.paste(logo_resized, (x, y))
    return canvas


def main():
    logo = load_logo()
    os.makedirs(ANDROID_DRAWABLE, exist_ok=True)
    os.makedirs(IOS_SPLASH, exist_ok=True)

    android_splash = make_splash_canvas(512, logo, logo_scale=0.55)
    android_splash.save(os.path.join(ANDROID_DRAWABLE, "splash_logo.png"), optimize=True)

    ios_sizes = {
        "splash-2732x2732-2.png": 2732,
        "splash-2732x2732-1.png": 2732,
        "splash-2732x2732.png": 2732,
    }
    for name, px in ios_sizes.items():
        make_splash_canvas(px, logo).save(os.path.join(IOS_SPLASH, name), optimize=True)

    print("OK: Android splash_logo.png")
    print("OK: iOS Splash.imageset (3 PNGs)")


if __name__ == "__main__":
    main()
