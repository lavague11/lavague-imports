// Replaces the solid black background of product photos with white by
// flood-filling the connected black region inward from the image borders
// (interior dark details like caps/text are preserved). The cleaned image is
// stored in MediaAsset and set on the product via a durable ProductOverride.
// Dry run: DRY=1 node scripts/fix-black-bg.mjs
import "dotenv/config";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { Jimp } from "jimp";

const DRY = process.env.DRY === "1";
const TH = 50; // a pixel is "background black" if r,g,b all below this

// The confirmed black-background PRODUCT photos worth whitening. The scan also
// flagged the Coco Noura Charcoal 72 image, but that one is a marketing banner
// where black is intentional (white promo text + charcoal graphic) — whitening
// ruined it, so it is deliberately excluded and left on its original image.
const TARGETS = [
  "https://static.wixstatic.com/media/68c626_b5a7f4c18b7b4a7bafcf097e96a16e5b~mv2.jpg",
  "https://cdn.shopify.com/s/files/1/0417/1546/6391/files/macewhole_100g.png?v=1755443554",
  "https://cdn.shopify.com/s/files/1/0417/1546/6391/files/Currypowderhot200g.png?v=1755445505",
  "https://cdn.shopify.com/s/files/1/0417/1546/6391/files/Currypowdermild200g.png?v=1755445332",
  "https://cdn.shopify.com/s/files/1/0417/1546/6391/files/Tumeric_whole_100g.png?v=1755446176",
];

/** Flood-fill connected near-black pixels from the borders, painting white.
 *  Returns {filledPct} or null if it would wipe too much (looks unsafe). */
function whitenBackground(img) {
  const { width: w, height: h, data: d } = img.bitmap;
  const isBlack = (idx) => d[idx] < TH && d[idx + 1] < TH && d[idx + 2] < TH;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const pushIf = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p]) return;
    seen[p] = 1;
    if (isBlack(p * 4)) stack.push(p);
  };
  for (let x = 0; x < w; x++) { pushIf(x, 0); pushIf(x, h - 1); }
  for (let y = 0; y < h; y++) { pushIf(0, y); pushIf(w - 1, y); }
  let filled = 0;
  while (stack.length) {
    const p = stack.pop();
    const i = p * 4;
    d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 255;
    filled++;
    const x = p % w, y = (p - x) / w;
    pushIf(x + 1, y); pushIf(x - 1, y); pushIf(x, y + 1); pushIf(x, y - 1);
  }
  const filledPct = (100 * filled) / (w * h);
  return { filledPct };
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

for (const url of TARGETS) {
  const prod = (await c.query(`SELECT id, slug, name FROM "Product" WHERE "imageUrl"=$1 AND "isActive"=true LIMIT 1`, [url])).rows[0];
  if (!prod) { console.log(`skip (no product): ${url}`); continue; }
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) { console.log(`fetch ${res.status}: ${prod.name}`); continue; }
    const img = await Jimp.read(Buffer.from(await res.arrayBuffer()));
    const { filledPct } = whitenBackground(img);
    if (filledPct < 8) { console.log(`skip (little black filled ${filledPct.toFixed(0)}%): ${prod.name}`); continue; }
    if (filledPct > 88) { console.log(`SKIP (unsafe: would white-out ${filledPct.toFixed(0)}%): ${prod.name}`); continue; }
    const out = await img.getBuffer("image/jpeg", { quality: 88 });
    console.log(`${DRY ? "[DRY] " : ""}fixed ${prod.name}  (whitened ${filledPct.toFixed(0)}% → ${(out.length / 1024) | 0}KB)`);
    if (DRY) continue;
    const id = randomBytes(16).toString("hex");
    await c.query(`INSERT INTO "MediaAsset" (id,"contentType",data) VALUES ($1,'image/jpeg',$2)`, [id, out]);
    const media = `/media/${id}`;
    await c.query(`UPDATE "Product" SET "imageUrl"=$1, "updatedAt"=now() WHERE id=$2`, [media, prod.id]);
    await c.query(
      `INSERT INTO "ProductOverride" (id, slug, "imageUrl", "updatedAt")
       VALUES (gen_random_uuid()::text,$1,$2,now())
       ON CONFLICT (slug) DO UPDATE SET "imageUrl"=$2, "updatedAt"=now()`,
      [prod.slug, media],
    );
    await c.query(`DELETE FROM "ImageThumb" WHERE key=$1`, [url]); // drop stale black thumb
  } catch (e) {
    console.log(`ERROR ${prod.name}: ${e.message}`);
  }
}
await c.end();
