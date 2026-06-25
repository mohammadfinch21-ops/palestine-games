import fitz, os
from PIL import Image
import io

PDF = r"C:\Users\السيريسي\Downloads\لعبة قطار فلسطين\الخارطة.pdf"
OUT = r"C:\Users\السيريسي\Downloads\لعبة قطار فلسطين\app\assets"
doc = fitz.open(PDF)
page = doc[0]
r = page.rect
print("page", r)

for i, im in enumerate(page.get_images(full=True)):
    b = doc.extract_image(im[0])
    ext = b["ext"]
    path = os.path.join(OUT, f"_pdf_img_{i}.{ext}")
    with open(path, "wb") as f:
        f.write(b["image"])
    print(i, b["width"], b["height"], ext)

# Try several clip regions
regions = {
    "left_top": fitz.Rect(r.x0, r.y0, r.x0 + r.width * 0.14, r.y0 + r.height * 0.22),
    "right_top": fitz.Rect(r.x1 - r.width * 0.14, r.y0, r.x1, r.y0 + r.height * 0.22),
    "left_emblem": fitz.Rect(r.x0 + r.width * 0.018, r.y0 + r.height * 0.008, r.x0 + r.width * 0.105, r.y0 + r.height * 0.125),
    "right_emblem": fitz.Rect(r.x1 - r.width * 0.105, r.y0 + r.height * 0.008, r.x1 - r.width * 0.018, r.y0 + r.height * 0.125),
}
for name, rect in regions.items():
    pix = page.get_pixmap(dpi=300, clip=rect, alpha=False)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    img.save(os.path.join(OUT, f"_clip_{name}.png"))
    print(name, img.size)

doc.close()
