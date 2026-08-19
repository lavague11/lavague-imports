# Extracts the product photo for each Yemen-catalog product and saves it as
# public/products/yemen/<SKU>.png, matched to the SKU by grid position. Renders
# the image region (RGB on white) so any colorspace/encoding comes out clean.
#
# Run: python scripts/extract-yemen-images.py
import io, os, re, sys
import pymupdf  # PyMuPDF

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

PDF = r"C:\Users\La Vague\Desktop\LV Imports\Full Yemen Catalog.pdf"
OUT_DIR = "public/products/yemen"
COL_BOUNDS = [(0, 230), (230, 410), (410, 612)]
SKU_RE = re.compile(r"^[A-Z]\d+-\d+[A-Za-z]?$")
ZOOM = 3  # render scale for crisp images


def col_of(x):
    for i, (lo, hi) in enumerate(COL_BOUNDS):
        if lo <= x < hi:
            return i
    return 2


def skus_on_page(page):
    words = page.get_text("words")  # (x0,y0,x1,y1, word, block, line, wno)
    words.sort(key=lambda w: (round(w[1]), w[0]))
    # Merge a stray trailing digit into a split SKU ("A1-01" + "2").
    merged, i = [], 0
    while i < len(words):
        w = list(words[i])
        if SKU_RE.match(w[4]) and i + 1 < len(words):
            n = words[i + 1]
            if re.fullmatch(r"\d", n[4]) and abs(n[1] - w[1]) < 6 and 0 < n[0] - w[2] < 18:
                w[4] += n[4]
                w[2] = n[2]
                i += 1
        merged.append(w)
        i += 1
    return [w for w in merged if SKU_RE.match(w[4])]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    doc = pymupdf.open(PDF)
    saved, seen_sku = 0, set()

    for page in doc:
        skus = skus_on_page(page)
        if not skus:
            continue
        images = page.get_image_info()  # dicts with 'bbox'
        for w in skus:
            sku = w[4]
            if sku in seen_sku:
                continue
            sx = (w[0] + w[2]) / 2
            col = col_of(sx)
            sy = w[1]
            # The product photo sits just below the SKU label, same column.
            best, best_dy = None, 1e9
            for im in images:
                b = im["bbox"]
                cx = (b[0] + b[2]) / 2
                if col_of(cx) != col:
                    continue
                dy = b[1] - sy
                if 0 <= dy <= 175 and dy < best_dy:
                    best, best_dy = b, dy
            if not best:
                continue
            rect = pymupdf.Rect(best)
            if rect.width < 10 or rect.height < 10:
                continue
            pix = page.get_pixmap(clip=rect, matrix=pymupdf.Matrix(ZOOM, ZOOM))
            pix.save(os.path.join(OUT_DIR, f"{sku}.png"))
            seen_sku.add(sku)
            saved += 1

    print(f"Saved {saved} product images to {OUT_DIR}/")


main()
