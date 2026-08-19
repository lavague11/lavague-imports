// Pulls fattals.com's catalog (BigCommerce) into catalog.fattals.json by
// crawling the product sitemap and parsing each product page's JSON-LD.
//
// Run: node scripts/import-fattals.mjs
import fs from "node:fs";

const OUT = "src/lib/catalog/catalog.fattals.json";
const UA = { "User-Agent": "Mozilla/5.0 (La Vague catalog import)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, attempt = 0) {
  const res = await fetch(url, { headers: UA });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) throw new Error(`${res.status} ${url}`);
    await sleep(1500 * (attempt + 1));
    return fetchText(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function decode(s) {
  return (s || "")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"')
    .replace(/&#0?39;|&rsquo;|&apos;|&#8217;/g, "'").replace(/&hellip;/g, "…");
}
function slugify(s) {
  return (
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "item"
  );
}
function jsonLdBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)]
    .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
    .filter(Boolean)
    .flatMap((d) => (Array.isArray(d) ? d : d["@graph"] || [d]));
}
function typeIs(item, t) {
  const ty = item["@type"];
  return Array.isArray(ty) ? ty.some((x) => new RegExp(t, "i").test(x)) : new RegExp(t, "i").test(ty || "");
}

const run = async () => {
  // Collect product URLs from the sitemap.
  const urls = [];
  for (let page = 1; page <= 10; page += 1) {
    let sm;
    try {
      sm = await fetchText(`https://fattals.com/xmlsitemap.php?type=products&page=${page}`);
    } catch {
      break; // sitemap paginates until it 404s
    }
    const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
    if (locs.length === 0) break;
    urls.push(...locs);
    await sleep(300);
  }
  console.log("product URLs:", urls.length);

  const usedSlugs = new Set();
  const usedSkus = new Set();
  const products = [];
  const catCounts = {};
  let done = 0;

  for (const url of urls) {
    let html;
    try {
      html = await fetchText(url);
    } catch {
      await sleep(300);
      continue;
    }
    const blocks = jsonLdBlocks(html);
    const prod = blocks.find((b) => typeIs(b, "Product"));
    const crumb = blocks.find((b) => typeIs(b, "BreadcrumbList"));
    if (prod) {
      const name = decode(prod.name || "").replace(/\s+/g, " ").trim();
      if (name) {
        const offer = Array.isArray(prod.offers) ? prod.offers[0] : prod.offers;
        const priceNum = parseFloat(offer?.price ?? "0");
        const priceCents = priceNum > 0 ? Math.round(priceNum * 100) : null;
        let image = Array.isArray(prod.image) ? prod.image[0] : prod.image;
        if (image) image = image.replace(/\{:size\}|\{size\}/g, "1280x1280");
        const brand = (typeof prod.brand === "object" ? prod.brand?.name : prod.brand) || null;

        // Category = the breadcrumb node just before the product (skip Home/Online Shop).
        let category = null;
        if (crumb?.itemListElement) {
          const names = crumb.itemListElement
            .map((e) => decode(e.name || e.item?.name || ""))
            .filter((n) => n && !/^home$/i.test(n) && !/^online shop$/i.test(n));
          category = names[names.length - 2] || names[names.length - 1] || null;
        }

        let slug = slugify(name);
        let s = slug, n = 2;
        while (usedSlugs.has(s)) s = `${slug}-${n++}`;
        slug = s; usedSlugs.add(slug);

        let sku = (prod.sku || "").toString().trim() || `FAT-${slug}`.toUpperCase().slice(0, 40);
        let sk = sku, k = 2;
        while (usedSkus.has(sk)) sk = `${sku}-${k++}`;
        sku = sk; usedSkus.add(sku);

        if (category) catCounts[category] = (catCounts[category] || 0) + 1;

        products.push({
          source: "fattals",
          id: "fat_" + slug,
          slug,
          name,
          tagline: null,
          description: decode(prod.description || "").replace(/\s+/g, " ").trim().slice(0, 900) || `${name} — stocked by La Vague Imports.`,
          origin: null,
          brand: brand ? decode(brand) : null,
          imageUrl: image || null,
          ribbon: null,
          isFeatured: false,
          collections: category ? [category] : [],
          variants: [
            {
              id: "fat_var_" + slug,
              sku,
              name: "Each",
              retailPriceCents: priceCents,
              compareAtPriceCents: null,
              unitsPerCase: null,
              minOrderCases: null,
              inStock: !offer?.availability || /InStock/i.test(offer.availability),
            },
          ],
        });
      }
    }
    done += 1;
    if (done % 25 === 0) console.log(`  …${done}/${urls.length}`);
    await sleep(300);
  }

  fs.writeFileSync(OUT, JSON.stringify({ products }, null, 2));
  const priced = products.filter((p) => p.variants[0].retailPriceCents != null).length;
  console.log("\nWrote", OUT);
  console.log("  products:", products.length, "| priced:", priced, "| with image:", products.filter((p) => p.imageUrl).length);
  console.log("  Fattal's categories:");
  Object.entries(catCounts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log("   ", String(v).padStart(3), k));
};

run().catch((e) => { console.error(e); process.exit(1); });
