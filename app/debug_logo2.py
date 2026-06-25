import fitz, os, io
from PIL import Image

PDF = r"C:\Users\السيريسي\Downloads\لعبة قطار فلسطين\الخارطة.pdf"
OUT = r"C:\Users\السيريسي\Downloads\لعبة قطار فلسطين\app\assets"
doc = fitz.open(PDF)
page = doc[0]
r = page.rect

crops = {
    "wide_left_emblem": fitz.Rect(r.x0 + r.width * 0.005, r.y0 + r.height * 0.006, r.x0 + r.width * 0.13, r.y0 + r.height * 0.115),
    "wide_left_lockup": fitz.Rect(r.x0 + r.width * 0.005, r.y0 + r.height * 0.006, r.x0 + r.width * 0.165, r.y0 + r.height * 0.215),
    "right_emblem": fitz.Rect(r.x1 - r.width * 0.105, r.y0 + r.height * 0.008, r.x1 - r.width * 0.018, r.y0 + r.height * 0.125),
}
for name, rect in crops.items():
    pix = page.get_pixmap(dpi=300, clip=rect, alpha=False)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    img.save(os.path.join(OUT, f"_clip_{name}.png"))
    print(name, tuple(round(v, 1) for v in rect), img.size)
doc.close()
