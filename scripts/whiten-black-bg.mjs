// Whitens the solid-black background of a fixed list of product photos and
// commits the cleaned images to public/products/whitened/, then records the
// swap in src/lib/catalog/image-overrides.json so build-catalog re-applies it
// on every rebuild. DB-free (unlike the older fix-black-bg.mjs) — the cleaned
// images ship in the repo and the override is data, so it survives redeploys
// and works off the fallback catalog.
//
// Run: node scripts/whiten-black-bg.mjs
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Jimp } from "jimp";

const OUT_DIR = "public/products/whitened";
const WEB_DIR = "/products/whitened";
const OVERRIDES = "src/lib/catalog/image-overrides.json";
const TH = 50; // r,g,b all below this = background black

// Photos whose black background should be flood-filled to white.
const WHITEN = [
  "https://cdn.shopify.com/s/files/1/0417/1546/6391/files/Currypowdermild200g.png?v=1755445332",
  "https://cdn.shopify.com/s/files/1/0417/1546/6391/files/macewhole_100g.png?v=1755443554",
  "https://cdn.shopify.com/s/files/1/0417/1546/6391/files/Currypowderhot200g.png?v=1755445505",
  "https://cdn.shopify.com/s/files/1/0417/1546/6391/files/Garammasala200g.png?v=1755442686",
  "https://cdn.shopify.com/s/files/1/0417/1546/6391/files/Tumeric_whole_100g.png?v=1755446176",
  "https://cdn.shopify.com/s/files/1/0417/1546/6391/files/WhatsAppImage2025-09-23at3.04.16PM.jpg?v=1758655123",
  "https://cdn.shopify.com/s/files/1/0417/1546/6391/files/IMG_0814.jpg?v=1758134937",
  "https://moroccanpantryshop.com/wp-content/uploads/2026/03/Caraway-ground-50lbs-or-5512lbs-2.jpg",
];

// Photos to swap for a clean image instead of flood-filling (flood-fill left a
// dark patch trapped in the jug handle). Borrow the same product's clean sibling.
const REPLACE = {
  "https://static.wixstatic.com/media/68c626_b5a7f4c18b7b4a7bafcf097e96a16e5b~mv2.jpg":
    "https://static.wixstatic.com/media/acbaa7_8eb27fad8e514e23a93188a0c5ac4710~mv2.jpg",
};

// Deliberately NOT touched: the Coco Noura Charcoal photo — its black is an
// intentional marketing background for a charcoal product.

function whiten(img) {
  const { width: w, height: h, data: d } = img.bitmap;
  const isBlack = (i) => d[i] < TH && d[i + 1] < TH && d[i + 2] < TH;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p]) return;
    seen[p] = 1;
    if (isBlack(p * 4)) stack.push(p);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  let filled = 0;
  while (stack.length) {
    const p = stack.pop();
    const i = p * 4;
    d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 255;
    filled++;
    const x = p % w, y = (p - x) / w;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return (100 * filled) / (w * h);
}

const shortHash = (s) => createHash("sha1").update(s).digest("hex").slice(0, 12);

mkdirSync(OUT_DIR, { recursive: true });
const overrides = existsSync(OVERRIDES) ? JSON.parse(readFileSync(OVERRIDES, "utf8")) : {};

for (const url of WHITEN) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) { console.log(`fetch ${res.status}: ${url}`); continue; }
    const img = await Jimp.read(Buffer.from(await res.arrayBuffer()));
    const pct = whiten(img);
    if (pct < 5 || pct > 92) { console.log(`skip (unsafe ${pct.toFixed(0)}%): ${url}`); continue; }
    // Downscale to a thumbnail-friendly size and compress — these ship in the repo.
    if (Math.max(img.bitmap.width, img.bitmap.height) > 800) img.scaleToFit({ w: 800, h: 800 });
    const out = await img.getBuffer("image/jpeg", { quality: 82 });
    const file = `${shortHash(url)}.jpg`;
    writeFileSync(join(OUT_DIR, file), out);
    overrides[url] = `${WEB_DIR}/${file}`;
    console.log(`whitened ${pct.toFixed(0)}% -> ${WEB_DIR}/${file} (${(out.length / 1024) | 0}KB)`);
  } catch (e) {
    console.log(`ERROR ${url}: ${e.message}`);
  }
}

for (const [from, to] of Object.entries(REPLACE)) {
  overrides[from] = to;
  console.log(`replaced -> ${to}`);
}

writeFileSync(OVERRIDES, JSON.stringify(overrides, null, 2) + "\n");
console.log(`\nWrote ${OVERRIDES} (${Object.keys(overrides).length} overrides)`);
