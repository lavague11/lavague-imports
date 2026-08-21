// Extracts authentic product photos from the Noura USA catalog PDF and matches
// each to its product by page + on-page position (the photo sits directly above
// its name label). Two modes:
//   SAVE=1  -> write matched JPEGs to scratchpad for visual review, no DB writes
//   (default, no SAVE) -> store in MediaAsset and set Product.imageUrl + override
// Env: PDF=<path> DB via DATABASE_URL. Optional PAGES="6,7,8" to limit pages.
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { Jimp } from "jimp";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const U = pdfjs.Util, OPS = pdfjs.OPS;
const SAVE = process.env.SAVE === "1";
const PDF = process.env.PDF || "C:/Users/La Vague/Downloads/Noura USA LLC catalog.pdf";
const SAVE_DIR = "C:/Users/LAVAGU~1/AppData/Local/Temp/claude/C--Users-La-Vague-Desktop-La-Vague-Imports/f44646aa-96cc-4c86-ab98-a05e3e2edd9b/scratchpad/noura-imgs";
const ADDLIST = "C:/Users/La Vague/Desktop/La Vague Imports/scripts/noura-add-list.json";
const onlyPages = process.env.PAGES ? new Set(process.env.PAGES.split(",").map(Number)) : null;
// Slugs whose auto-match was verified wrong (adjacent look-alike product) and
// must not be applied.
const SKIP = new Set(["coffee-break-cafe-latte", ...(process.env.SKIP || "").split(",").filter(Boolean)]);

const norm = (s) => (s || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const toks = (s) => new Set(norm(s).split(" ").filter((t) => t.length > 1 && !["noura","the","of","with","and"].includes(t)));
const jac = (a, b) => { const A = toks(a), B = toks(b); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / new Set([...A, ...B]).size; };

async function imgToJpeg(page, id) {
  const o = await new Promise((res) => page.objs.get(id, res));
  if (!o || !o.data || !o.width) return null;
  const { width: w, height: h, kind, data } = o;
  const img = new Jimp({ width: w, height: h });
  const out = img.bitmap.data;
  if (kind === 3) Buffer.from(data.buffer || data).copy(out);
  else if (kind === 2) { for (let p = 0, q = 0; p < data.length; p += 3, q += 4) { out[q] = data[p]; out[q + 1] = data[p + 1]; out[q + 2] = data[p + 2]; out[q + 3] = 255; } }
  else if (kind === 1) { for (let p = 0, q = 0; p < data.length; p++, q += 4) { const v = data[p]; out[q] = out[q + 1] = out[q + 2] = v; out[q + 3] = 255; } }
  else return null;
  return { buf: await img.getBuffer("image/jpeg", { quality: 82 }), w, h };
}

async function pageData(page) {
  const ops = await page.getOperatorList();
  let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
  const images = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], a = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm.slice());
    else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = U.transform(ctm, a);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
      const w = Math.abs(ctm[0]), h = Math.abs(ctm[3]);
      images.push({ id: a[0], x: ctm[4], y: ctm[5], w, h, cx: ctm[4] + w / 2 });
    }
  }
  const tc = await page.getTextContent();
  // group text items into lines by y-bucket
  const lines = new Map();
  for (const t of tc.items) {
    if (!t.str.trim()) continue;
    const y = Math.round(t.transform[5] / 6) * 6;
    (lines.get(y) ?? lines.set(y, []).get(y)).push({ x: t.transform[4], str: t.str });
  }
  const textLines = [...lines.entries()].map(([y, arr]) => {
    arr.sort((a, b) => a.x - b.x);
    return { y, x: arr[0].x, cx: arr.reduce((s, i) => s + i.x, 0) / arr.length, text: arr.map((i) => i.str).join(" ") };
  });
  return { images, textLines };
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const prods = (await client.query(`
  SELECT p.slug, p.name, p.id, v.sku
  FROM "Product" p JOIN LATERAL (SELECT sku FROM "ProductVariant" WHERE "productId"=p.id ORDER BY position LIMIT 1) v ON true
  WHERE p.source='noura' AND (p."imageUrl" IS NULL OR btrim(p."imageUrl")='')`)).rows;
const pageBySku = new Map(JSON.parse(readFileSync(ADDLIST, "utf8")).map((r) => [r.sku, parseInt(r.page, 10)]));
for (const p of prods) p.page = pageBySku.get(p.sku);

const byPage = new Map();
for (const p of prods) { if (!p.page) continue; (byPage.get(p.page) ?? byPage.set(p.page, []).get(p.page)).push(p); }

if (SAVE) mkdirSync(SAVE_DIR, { recursive: true });
const data = new Uint8Array(readFileSync(PDF));
const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

let matched = 0, unmatched = 0;
const report = [];
for (const [pageNo, list] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
  if (onlyPages && !onlyPages.has(pageNo)) continue;
  if (pageNo < 1 || pageNo > doc.numPages) { list.forEach((p) => report.push(`  NO PAGE ${pageNo}: ${p.name}`)); unmatched += list.length; continue; }
  const page = await doc.getPage(pageNo);
  const { images, textLines } = await pageData(page);
  // Resolve each product to its best label line.
  const labels = [];
  for (const p of list) {
    if (SKIP.has(p.slug)) { unmatched++; continue; }
    let bestLine = null, bestScore = 0;
    for (const ln of textLines) { const s = jac(p.name, ln.text); if (s > bestScore) { bestScore = s; bestLine = ln; } }
    if (!bestLine || bestScore < 0.34) { report.push(`  p${pageNo} NO-LABEL (${(bestScore*100)|0}%) ${p.name}`); unmatched++; continue; }
    labels.push({ p, line: bestLine, score: bestScore });
  }
  const cand = images.filter((im) => { const ar = im.w / im.h; return im.w >= 60 && im.h >= 60 && ar <= 2.4 && ar >= 0.42; });
  // Image-centric assignment: each photo goes to the label directly below it,
  // tightly centered (|Δcx| < 0.5·width). Nearest label wins each image; nearest
  // image wins each label. Ambiguous ties are dropped rather than guessed.
  const forLabel = new Map(); // label index -> {im, gap}
  for (const im of cand) {
    let bi = -1, bg = 1e9, second = 1e9;
    labels.forEach((l, idx) => {
      const gap = im.y - l.line.y;
      if (gap > -20 && gap < 95 && Math.abs(im.cx - l.line.cx) < im.w * 0.5) {
        if (gap < bg) { second = bg; bg = gap; bi = idx; } else if (gap < second) second = gap;
      }
    });
    if (bi < 0) continue;
    const cur = forLabel.get(bi);
    if (!cur || bg < cur.gap) forLabel.set(bi, { im, gap: bg });
  }
  const chosen = new Map(); // label idx -> im
  for (const [idx, v] of forLabel) chosen.set(idx, v.im);
  for (let li = 0; li < labels.length; li++) {
    const { p, score } = labels[li];
    const im = chosen.get(li);
    if (!im) { report.push(`  p${pageNo} NO-IMG   ${p.name}`); unmatched++; continue; }
    const jp = await imgToJpeg(page, im.id);
    if (!jp) { report.push(`  p${pageNo} DECODE-FAIL ${p.name}`); unmatched++; continue; }
    matched++;
    const bestScore = score, bestImg = im;
    report.push(`  p${pageNo} OK (${(bestScore*100)|0}%) ${bestImg.w|0}x${bestImg.h|0}  ${p.name}`);
    if (SAVE) writeFileSync(`${SAVE_DIR}/${p.slug}.jpg`, jp.buf);
    else {
      const id = randomBytes(16).toString("hex");
      await client.query(`INSERT INTO "MediaAsset" (id,"contentType",data) VALUES ($1,'image/jpeg',$2)`, [id, jp.buf]);
      const media = `/media/${id}`;
      await client.query(`UPDATE "Product" SET "imageUrl"=$1,"updatedAt"=now() WHERE id=$2`, [media, p.id]);
      await client.query(`INSERT INTO "ProductOverride" (id,slug,"imageUrl","updatedAt") VALUES (gen_random_uuid()::text,$1,$2,now()) ON CONFLICT (slug) DO UPDATE SET "imageUrl"=$2,"updatedAt"=now()`, [p.slug, media]);
    }
  }
}
console.log(report.join("\n"));
console.log(`\n${SAVE ? "[SAVE] " : ""}matched ${matched}, unmatched ${unmatched}, of ${prods.length} missing-image noura products`);
if (SAVE) console.log("review images in:", SAVE_DIR);
await client.end();
