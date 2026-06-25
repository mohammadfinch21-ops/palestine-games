"""Debug step digit extraction + Windows OCR."""
import os, re, json, asyncio
import numpy as np
import cv2
from PIL import Image, ImageEnhance
import easyocr

APP = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(APP, "assets", "images", "questions")
reader = easyocr.Reader(["ar"], gpu=False, verbose=False)

def crop_frac(img, frac):
    w, h = img.size
    return img.crop((int(frac[0]*w), int(frac[1]*h), int(frac[2]*w), int(frac[3]*h)))

def extract_circle_digit(pil, row_frac):
    """Find white circle in step row and read digit."""
    crop = crop_frac(pil, row_frac)
    gray = cv2.cvtColor(np.array(crop), cv2.COLOR_RGB2GRAY)
    _, th = cv2.threshold(gray, 175, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    # White circle is usually the rightmost/largest blob
    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    for c in contours[:3]:
        area = cv2.contourArea(c)
        if area < 100:
            continue
        x, y, cw, ch = cv2.boundingRect(c)
        if cw < 5 or ch < 5:
            continue
        roi = th[y:y+ch, x:x+cw]
        roi_big = cv2.resize(roi, (max(64, cw*8), max(64, ch*8)), interpolation=cv2.INTER_CUBIC)
        results = reader.readtext(roi_big, detail=0, allowlist="123456789")
        for t in results:
            m = re.search(r"[1-6]", t)
            if m:
                return int(m.group())
    return None

ROW_CORRECT = (0.08, 0.52, 0.92, 0.58)
ROW_WRONG = (0.08, 0.60, 0.92, 0.66)
Q_BOX = (0.12, 0.17, 0.88, 0.42)
A_BOX = (0.15, 0.77, 0.85, 0.90)

KNOWN = {
    "q-p01-00.jpeg": (2, 1),
    "q-p01-01.jpeg": (6, 1),
    "q-p01-05.jpeg": (6, 1),
    "q-p01-02.jpeg": None,
    "q-p01-03.jpeg": None,
}

async def win_ocr_pil(pil_img):
    try:
        import winrt.windows.media.ocr as ocr_mod
        import winrt.windows.graphics.imaging as img_mod
        from winrt.windows.storage.streams import InMemoryRandomAccessStream, DataWriter

        # Save as PNG bytes and load via stream
        import io
        buf = io.BytesIO()
        pil_img.convert("RGBA").save(buf, format="PNG")
        png_bytes = buf.getvalue()

        stream = InMemoryRandomAccessStream()
        writer = DataWriter(stream)
        writer.write_bytes(png_bytes)
        await writer.store_async()
        stream.seek(0)

        decoder = await img_mod.BitmapDecoder.create_async(stream)
        sb = await decoder.get_software_bitmap_async()
        engine = ocr_mod.OcrEngine.try_create_from_user_profile_languages()
        if not engine:
            return ""
        result = await engine.recognize_async(sb)
        return result.text if result else ""
    except Exception as e:
        return f"ERR:{e}"

async def main():
    results = []
    for fname, expected in KNOWN.items():
        if expected is None:
            continue
        path = os.path.join(IMG_DIR, fname)
        img = Image.open(path).convert("RGB")
        sc = extract_circle_digit(img, ROW_CORRECT)
        sw = extract_circle_digit(img, ROW_WRONG)
        q_crop = crop_frac(img, Q_BOX)
        a_crop = crop_frac(img, A_BOX)
        q_win = await win_ocr_pil(q_crop)
        a_win = await win_ocr_pil(a_crop)
        results.append({
            "file": fname,
            "stepsCorrect": sc,
            "stepsWrong": sw,
            "expected": expected,
            "question_win": q_win,
            "answer_win": a_win,
        })

    with open(os.path.join(APP, "_test_ocr_result.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print("done")

asyncio.run(main())
