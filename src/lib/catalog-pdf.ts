import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import QRCode from "qrcode";

// US Letter, points.
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const COLS = 3;
const ROWS = 4;
const PER_PAGE = COLS * ROWS;

const OLIVE = rgb(0.2, 0.23, 0.12);
const OLIVE_MID = rgb(0.42, 0.44, 0.31);
const GRAY = rgb(0.5, 0.5, 0.46);
const LINE = rgb(0.85, 0.86, 0.8);
const CREAM = rgb(0.96, 0.96, 0.93);

export interface PdfProduct {
  name: string;
  sku: string;
  size: string;
  /** Secondary line under the name, e.g. "70 g · Spices & Herbs". */
  meta: string;
  /** Country of origin (drives the flag icon); null if unknown. */
  origin: string | null;
  image?: { bytes: Uint8Array; type: "png" | "jpg" } | null;
}
export interface PdfCategory {
  name: string;
  products: PdfProduct[];
}
export interface CatalogPdfInput {
  scopeLabel: string;
  dateLabel: string;
  shopUrl: string;
  phone: string;
  email: string;
  categories: PdfCategory[];
  /** Country name → flag image bytes (embedded once, reused per product). */
  flags: Record<string, { bytes: Uint8Array; type: "png" | "jpg" }>;
}

/** Transliterate to WinAnsi-safe ASCII — the standard PDF fonts can't encode
 *  Turkish/Arabic/extended letters (ı, ş, ğ, İ, …) that appear in brand names. */
function ascii(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics (é→e, ç→c, ş→s)
    .replace(/ı/g, "i").replace(/İ/g, "I")
    .replace(/ł/g, "l").replace(/Ł/g, "L").replace(/ø/g, "o").replace(/Ø/g, "O")
    .replace(/æ/g, "ae").replace(/Æ/g, "AE").replace(/œ/g, "oe").replace(/Œ/g, "OE").replace(/ß/g, "ss")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-").replace(/…/g, "...")
    .replace(/[^\x20-\x7e]/g, ""); // drop anything still non-ASCII
}

/** Greedy word-wrap into at most `maxLines` lines, ellipsising overflow. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      cur = trial;
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  // ellipsis if we ran out of room
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (last && font.widthOfTextAtSize(last + "…", size) > maxWidth) last = last.slice(0, -1);
    if (words.join(" ") !== lines.join(" ")) lines[maxLines - 1] = last.trimEnd() + "…";
  }
  return lines;
}

interface Ctx {
  doc: PDFDocument;
  serif: PDFFont;
  serifBold: PDFFont;
  sans: PDFFont;
  sansBold: PDFFont;
  flags: Map<string, import("pdf-lib").PDFImage>;
}

function footer(page: PDFPage, ctx: Ctx, pageNo: number) {
  const label = `La Vague Imports  ·  International tastes, delivered  ·  ${pageNo}`;
  const w = ctx.sans.widthOfTextAtSize(label, 8);
  page.drawText(label, { x: (PAGE_W - w) / 2, y: 30, size: 8, font: ctx.sans, color: GRAY });
}

function centered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color: RGB) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (PAGE_W - w) / 2, y, size, font, color });
}

async function drawCover(ctx: Ctx, input: CatalogPdfInput) {
  const page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: CREAM });
  page.drawRectangle({ x: 0, y: PAGE_H - 170, width: PAGE_W, height: 170, color: OLIVE });

  centered(page, "LA VAGUE IMPORTS", PAGE_H - 95, ctx.serifBold, 30, rgb(1, 1, 1));
  centered(page, "INTERNATIONAL TASTES, DELIVERED TO THE STATES", PAGE_H - 120, ctx.sans, 9.5, rgb(0.85, 0.87, 0.78));

  centered(page, "Product Catalog", 470, ctx.serif, 40, OLIVE);
  centered(page, input.scopeLabel, 435, ctx.sans, 12, OLIVE_MID);
  centered(page, input.dateLabel, 415, ctx.sans, 10, GRAY);

  // QR
  try {
    const qrPng = await QRCode.toBuffer(input.shopUrl, { type: "png", margin: 1, width: 300 });
    const qr = await ctx.doc.embedPng(qrPng);
    const size = 150;
    page.drawImage(qr, { x: (PAGE_W - size) / 2, y: 175, width: size, height: size });
    centered(page, "Scan to browse & order online", 155, ctx.sans, 10, OLIVE_MID);
    centered(page, input.shopUrl.replace(/^https?:\/\//, ""), 140, ctx.sans, 8.5, GRAY);
  } catch {
    /* QR optional */
  }

  centered(page, `Order by phone ${input.phone}  ·  ${input.email}`, 80, ctx.sans, 9, GRAY);
}

function drawTOC(ctx: Ctx, entries: { name: string; page: number }[], tocPages: number) {
  const perPage = 34;
  for (let p = 0; p < tocPages; p++) {
    const page = ctx.doc.addPage([PAGE_W, PAGE_H]);
    if (p === 0) {
      page.drawText("Contents", { x: MARGIN, y: PAGE_H - 80, size: 26, font: ctx.serif, color: OLIVE });
      page.drawLine({ start: { x: MARGIN, y: PAGE_H - 92 }, end: { x: PAGE_W - MARGIN, y: PAGE_H - 92 }, thickness: 1, color: LINE });
    }
    let y = PAGE_H - (p === 0 ? 120 : 70);
    for (const e of entries.slice(p * perPage, (p + 1) * perPage)) {
      page.drawText(e.name, { x: MARGIN, y, size: 11, font: ctx.sansBold, color: OLIVE });
      const pageStr = String(e.page);
      const pw = ctx.sans.widthOfTextAtSize(pageStr, 11);
      page.drawText(pageStr, { x: PAGE_W - MARGIN - pw, y, size: 11, font: ctx.sans, color: OLIVE_MID });
      // dotted leader
      const nameW = ctx.sansBold.widthOfTextAtSize(e.name, 11);
      page.drawText(".".repeat(120), {
        x: MARGIN + nameW + 6,
        y,
        size: 11,
        font: ctx.sans,
        color: LINE,
        maxWidth: PAGE_W - MARGIN * 2 - nameW - pw - 12,
      });
      y -= 19;
    }
    footer(page, ctx, 2 + p);
  }
}

function drawPlaceholder(page: PDFPage, ctx: Ctx, x: number, y: number, w: number, h: number) {
  page.drawRectangle({ x, y, width: w, height: h, color: CREAM, borderColor: LINE, borderWidth: 0.5 });
  centered2(page, ctx.serif, "La Vague", x, y + h / 2 - 5, w, 12, GRAY);
}
function centered2(page: PDFPage, font: PDFFont, text: string, x: number, y: number, w: number, size: number, color: RGB) {
  const tw = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: x + (w - tw) / 2, y, size, font, color });
}

async function drawCategory(ctx: Ctx, cat: PdfCategory, startPage: number): Promise<number> {
  const gap = 18;
  const cellW = (PAGE_W - MARGIN * 2 - gap * (COLS - 1)) / COLS;
  const gridTop = PAGE_H - 110;
  const gridBottom = 70;
  const rowH = (gridTop - gridBottom - gap * (ROWS - 1)) / ROWS;
  const imgH = rowH - 46;

  let pageNo = startPage;
  const pages = Math.max(1, Math.ceil(cat.products.length / PER_PAGE));
  for (let pi = 0; pi < pages; pi++) {
    const page = ctx.doc.addPage([PAGE_W, PAGE_H]);
    // header
    page.drawText(cat.name, { x: MARGIN, y: PAGE_H - 66, size: 20, font: ctx.serif, color: OLIVE });
    page.drawText("LA VAGUE IMPORTS CATALOG", { x: MARGIN, y: PAGE_H - 44, size: 8, font: ctx.sansBold, color: OLIVE_MID });
    page.drawLine({ start: { x: MARGIN, y: PAGE_H - 78 }, end: { x: PAGE_W - MARGIN, y: PAGE_H - 78 }, thickness: 1, color: LINE });

    const slice = cat.products.slice(pi * PER_PAGE, (pi + 1) * PER_PAGE);
    for (let i = 0; i < slice.length; i++) {
      const prod = slice[i];
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = MARGIN + col * (cellW + gap);
      const cellTop = gridTop - row * (rowH + gap);
      const imgY = cellTop - imgH;

      // image
      let drew = false;
      if (prod.image) {
        try {
          const img = prod.image.type === "png" ? await ctx.doc.embedPng(prod.image.bytes) : await ctx.doc.embedJpg(prod.image.bytes);
          const scale = Math.min(cellW / img.width, imgH / img.height);
          const dw = img.width * scale;
          const dh = img.height * scale;
          page.drawImage(img, { x: x + (cellW - dw) / 2, y: imgY + (imgH - dh) / 2, width: dw, height: dh });
          drew = true;
        } catch {
          /* fall through to placeholder */
        }
      }
      if (!drew) drawPlaceholder(page, ctx, x, imgY, cellW, imgH);

      // text
      let ty = imgY - 12;
      for (const ln of wrap(prod.name, ctx.sansBold, 8.5, cellW, 2)) {
        page.drawText(ln, { x, y: ty, size: 8.5, font: ctx.sansBold, color: OLIVE });
        ty -= 10;
      }
      // flag + meta line
      let mx = x;
      const flag = prod.origin ? ctx.flags.get(prod.origin) : undefined;
      if (flag) {
        const fw = 12;
        const fh = (flag.height / flag.width) * fw;
        page.drawImage(flag, { x, y: ty - fh + 1, width: fw, height: fh });
        page.drawRectangle({ x, y: ty - fh + 1, width: fw, height: fh, borderColor: LINE, borderWidth: 0.4 });
        mx = x + fw + 4;
      }
      if (prod.meta) {
        page.drawText(wrap(prod.meta, ctx.sans, 7.5, cellW - (mx - x), 1)[0] ?? "", { x: mx, y: ty - 1, size: 7.5, font: ctx.sans, color: GRAY });
      }
      ty -= 10;
      if (prod.sku) page.drawText(`SKU ${prod.sku}`, { x, y: ty - 1, size: 7, font: ctx.sans, color: OLIVE_MID });
    }
    footer(page, ctx, pageNo);
    pageNo++;
  }
  return pageNo;
}

function drawOrderPages(ctx: Ctx, cats: PdfCategory[], input: CatalogPdfInput, startPage: number) {
  const all = cats.flatMap((c) => c.products);
  const rowH = 22;
  const top = PAGE_H - 130;
  const bottom = 80;
  const perPage = Math.floor((top - bottom) / rowH);
  const pages = Math.max(1, Math.ceil(all.length / perPage));
  const colX = { sku: MARGIN, name: MARGIN + 90, size: MARGIN + 330, qty: PAGE_W - MARGIN - 70 };

  let pageNo = startPage;
  for (let p = 0; p < pages; p++) {
    const page = ctx.doc.addPage([PAGE_W, PAGE_H]);
    if (p === 0) {
      page.drawText("Order Form", { x: MARGIN, y: PAGE_H - 70, size: 26, font: ctx.serif, color: OLIVE });
      page.drawText(
        `Mark the quantities you want and send this page to ${input.email} or call ${input.phone}. We reply with a quote, case packs, and freight.`,
        { x: MARGIN, y: PAGE_H - 92, size: 9, font: ctx.sans, color: GRAY, maxWidth: PAGE_W - MARGIN * 2, lineHeight: 12 },
      );
    }
    // header row
    const hy = top + 6;
    page.drawRectangle({ x: MARGIN, y: hy - 4, width: PAGE_W - MARGIN * 2, height: 18, color: CREAM });
    page.drawText("SKU", { x: colX.sku + 2, y: hy, size: 8.5, font: ctx.sansBold, color: OLIVE });
    page.drawText("Product", { x: colX.name, y: hy, size: 8.5, font: ctx.sansBold, color: OLIVE });
    page.drawText("Size", { x: colX.size, y: hy, size: 8.5, font: ctx.sansBold, color: OLIVE });
    page.drawText("Qty", { x: colX.qty + 20, y: hy, size: 8.5, font: ctx.sansBold, color: OLIVE });

    let y = top - rowH + 6;
    for (const prod of all.slice(p * perPage, (p + 1) * perPage)) {
      page.drawText(prod.sku || "—", { x: colX.sku + 2, y, size: 8, font: ctx.sans, color: OLIVE_MID });
      page.drawText(wrap(prod.name, ctx.sans, 8.5, colX.size - colX.name - 8, 1)[0] ?? "", { x: colX.name, y, size: 8.5, font: ctx.sans, color: OLIVE });
      page.drawText(wrap(prod.size || "", ctx.sans, 8, colX.qty - colX.size - 8, 1)[0] ?? "", { x: colX.size, y, size: 8, font: ctx.sans, color: GRAY });
      page.drawRectangle({ x: colX.qty, y: y - 4, width: 56, height: 16, borderColor: LINE, borderWidth: 0.75 });
      page.drawLine({ start: { x: MARGIN, y: y - 8 }, end: { x: PAGE_W - MARGIN, y: y - 8 }, thickness: 0.4, color: LINE });
      y -= rowH;
    }
    footer(page, ctx, pageNo);
    pageNo++;
  }
}

/** Builds the catalog PDF and returns its bytes. */
export async function buildCatalogPdf(input: CatalogPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("La Vague Imports — Product Catalog");
  doc.setAuthor("La Vague Imports");
  const ctx: Ctx = {
    doc,
    serif: await doc.embedFont(StandardFonts.TimesRoman),
    serifBold: await doc.embedFont(StandardFonts.TimesRomanBold),
    sans: await doc.embedFont(StandardFonts.Helvetica),
    sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
    flags: new Map(),
  };
  for (const [country, f] of Object.entries(input.flags)) {
    try {
      ctx.flags.set(country, f.type === "png" ? await doc.embedPng(f.bytes) : await doc.embedJpg(f.bytes));
    } catch {
      /* skip a bad flag */
    }
  }

  const cats: PdfCategory[] = input.categories
    .filter((c) => c.products.length > 0)
    .map((c) => ({
      name: ascii(c.name),
      products: c.products.map((p) => ({
        ...p,
        name: ascii(p.name),
        sku: ascii(p.sku),
        size: ascii(p.size),
        meta: ascii(p.meta),
        origin: p.origin,
      })),
    }));
  const coverInput = { ...input, scopeLabel: ascii(input.scopeLabel), dateLabel: ascii(input.dateLabel) };

  // Page math: cover(1) + toc(tocPages) + products + order.
  const tocPages = Math.max(1, Math.ceil(cats.length / 34));
  let cursor = 1 + tocPages + 1; // first product page (1-indexed)
  const tocEntries: { name: string; page: number }[] = [];
  const catStart: number[] = [];
  for (const c of cats) {
    catStart.push(cursor);
    tocEntries.push({ name: c.name, page: cursor });
    cursor += Math.max(1, Math.ceil(c.products.length / PER_PAGE));
  }
  const orderStart = cursor;
  tocEntries.push({ name: "Order form", page: orderStart });

  await drawCover(ctx, coverInput);
  drawTOC(ctx, tocEntries.map((e) => ({ name: ascii(e.name), page: e.page })), tocPages);
  for (let i = 0; i < cats.length; i++) await drawCategory(ctx, cats[i], catStart[i]);
  drawOrderPages(ctx, cats, input, orderStart);

  return doc.save();
}
