# Extracts the QUWAIZI "Yemen Collection" PDF catalog into a structured JSON of
# products (sku, name, pack size, category). Fixed 3-column grid, parsed by word
# coordinates. Output: data-import/yemen-products.json
import io, json, re, sys
import pdfplumber

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

PDF = r"C:\Users\La Vague\Desktop\LV Imports\Full Yemen Catalog.pdf"
OUT = "data-import/yemen-products.json"

# Column x-boundaries (page width 612).
COL_BOUNDS = [(0, 230), (230, 410), (410, 612)]
SKU_RE = re.compile(r"^[A-Z]\d+-\d+[A-Za-z]?$")
UNIT_RE = re.compile(r"\b(g|gr|kg|ml|l|cl|pcs|pc|oz|lb|lbs|kilo)\b", re.I)


def col_of(x):
    for i, (lo, hi) in enumerate(COL_BOUNDS):
        if lo <= x < hi:
            return i
    return 2


def line_group(words, tol=4):
    """Cluster words into lines by their 'top', return list of (top, [words])."""
    lines = []
    for w in sorted(words, key=lambda w: (round(w["top"]), w["x0"])):
        if lines and abs(w["top"] - lines[-1][0]) <= tol:
            lines[-1][1].append(w)
        else:
            lines.append((w["top"], [w]))
    return [(t, sorted(ws, key=lambda w: w["x0"])) for t, ws in lines]


def category_header(words):
    top = [w for w in words if w["top"] < 40 and re.search(r"[A-Za-z&]", w["text"])]
    top.sort(key=lambda w: w["x0"])
    out = []
    for w in top:
        if w["text"] in ("–", "-") or re.search(r"[\u0600-\u06FF]", w["text"]):
            break
        out.append(w["text"])
    return " ".join(out).strip().title() or None


def parse_page(page):
    words = page.extract_words(use_text_flow=False, keep_blank_chars=False)
    category = category_header(words)

    # Merge a stray trailing digit into a split SKU ("A1-01" + "2" -> "A1-012").
    merged = []
    i = 0
    while i < len(words):
        w = words[i]
        if SKU_RE.match(w["text"]) and i + 1 < len(words):
            nxt = words[i + 1]
            if re.fullmatch(r"\d", nxt["text"]) and abs(nxt["top"] - w["top"]) < 6 and 0 < nxt["x0"] - w["x1"] < 18:
                w = dict(w, text=w["text"] + nxt["text"], x1=nxt["x1"])
                i += 1
        merged.append(w)
        i += 1
    words = merged

    skus = [w for w in words if SKU_RE.match(w["text"])]
    if not skus:
        return []

    products = []
    for col in range(3):
        lo, hi = COL_BOUNDS[col]
        col_skus = sorted([s for s in skus if lo <= s["x0"] < hi], key=lambda s: s["top"])
        col_words = [w for w in words if lo <= w["x0"] < hi and not SKU_RE.match(w["text"])]
        for idx, sku in enumerate(col_skus):
            top = sku["top"]
            bottom = col_skus[idx + 1]["top"] - 6 if idx + 1 < len(col_skus) else 9999
            # Never let a cell reach the page footer (contact band starts ~620),
            # which would pull "Sales@…/www…/phone" into the last product's name.
            bottom = min(bottom, 617)
            cell = [w for w in col_words if top < w["top"] < bottom]
            lines = line_group(cell)
            # The pack-size line is the lowest line containing a unit token.
            size_idx = None
            for li in range(len(lines) - 1, -1, -1):
                text = " ".join(w["text"] for w in lines[li][1])
                if UNIT_RE.search(text) and re.search(r"\d", text):
                    size_idx = li
                    break
            size = " ".join(w["text"] for w in lines[size_idx][1]) if size_idx is not None else ""
            name_lines = lines[:size_idx] if size_idx is not None else lines
            name = " ".join(" ".join(w["text"] for w in ws) for _, ws in name_lines)
            name = re.sub(r"\s+", " ", name).strip()
            if name:
                products.append({"sku": sku["text"], "name": name, "size": re.sub(r"\s+", " ", size).strip(), "category": category})
    return products


def main():
    all_products = []
    with pdfplumber.open(PDF) as pdf:
        for pno, page in enumerate(pdf.pages, 1):
            for p in parse_page(page):
                p["page"] = pno
                all_products.append(p)

    with io.open(OUT, "w", encoding="utf-8") as f:
        json.dump(all_products, f, ensure_ascii=False, indent=2)

    cats = {}
    for p in all_products:
        cats[p["category"]] = cats.get(p["category"], 0) + 1
    print(f"Extracted {len(all_products)} products to {OUT}")
    print("By category header:")
    for k, v in sorted(cats.items(), key=lambda x: -x[1]):
        print(f"  {v:4}  {k}")
    print("\nSample:")
    for p in all_products[:12]:
        print(f"  [{p['sku']}] {p['name']}  |  {p['size']}  |  {p['category']}")


main()
