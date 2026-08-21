import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import QRCode from "qrcode";

// US Letter, points.
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const COLS = 3;

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
/** A labelled run of products within a section (e.g. a category inside a
 *  country). An empty label draws no sub-divider. */
export interface PdfSubgroup {
  label: string;
  products: PdfProduct[];
  /** Render as a compact multi-column list (name · size · SKU) instead of image
   *  cards — for large single-brand variation groups. */
  list?: boolean;
}
export interface PdfSection {
  name: string;
  subgroups: PdfSubgroup[];
}
export interface CatalogPdfInput {
  scopeLabel: string;
  dateLabel: string;
  shopUrl: string;
  phone: string;
  email: string;
  sections: PdfSection[];
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

function centered2(page: PDFPage, font: PDFFont, text: string, x: number, y: number, w: number, size: number, color: RGB) {
  const tw = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: x + (w - tw) / 2, y, size, font, color });
}

/** One product card at the given top-left position. */
async function drawCard(ctx: Ctx, page: PDFPage, prod: PdfProduct, x: number, cellTop: number, cellW: number, rowH: number) {
  const pad = 8;
  const cellBottom = cellTop - rowH;
  page.drawRectangle({ x, y: cellBottom, width: cellW, height: rowH, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 0.6 });

  const imgTop = cellTop - pad;
  const imgBottom = cellBottom + 56;
  const imgH = imgTop - imgBottom;
  const imgLeft = x + pad;
  const imgW = cellW - pad * 2;

  let drew = false;
  if (prod.image) {
    try {
      const img = prod.image.type === "png" ? await ctx.doc.embedPng(prod.image.bytes) : await ctx.doc.embedJpg(prod.image.bytes);
      const scale = Math.min(imgW / img.width, imgH / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      page.drawImage(img, { x: imgLeft + (imgW - dw) / 2, y: imgBottom + (imgH - dh) / 2, width: dw, height: dh });
      drew = true;
    } catch {
      /* placeholder below */
    }
  }
  if (!drew) centered2(page, ctx.serif, "La Vague", imgLeft, imgBottom + imgH / 2 - 4, imgW, 12, rgb(0.78, 0.8, 0.7));

  page.drawLine({ start: { x: x + pad, y: cellBottom + 52 }, end: { x: x + cellW - pad, y: cellBottom + 52 }, thickness: 0.5, color: LINE });

  let ty = cellBottom + 42;
  for (const ln of wrap(prod.name, ctx.sansBold, 8.5, imgW, 2)) {
    page.drawText(ln, { x: x + pad, y: ty, size: 8.5, font: ctx.sansBold, color: OLIVE });
    ty -= 10;
  }
  if (prod.sku) page.drawText(`SKU ${prod.sku}`, { x: x + pad, y: cellBottom + 9, size: 7, font: ctx.sans, color: OLIVE_MID });

  const metaY = cellBottom + 21;
  let mx = x + pad;
  const flag = prod.origin ? ctx.flags.get(prod.origin) : undefined;
  if (flag) {
    const fw = 12;
    const fh = (flag.height / flag.width) * fw;
    page.drawImage(flag, { x: x + pad, y: metaY - 1, width: fw, height: fh });
    page.drawRectangle({ x: x + pad, y: metaY - 1, width: fw, height: fh, borderColor: LINE, borderWidth: 0.4 });
    mx = x + pad + fw + 5;
  }
  if (prod.meta) page.drawText(wrap(prod.meta, ctx.sans, 7, imgW - (mx - (x + pad)), 1)[0] ?? "", { x: mx, y: metaY + 1, size: 7, font: ctx.sans, color: GRAY });
}

/** Section (country/category) header, drawn atop every page of that section. */
function drawSectionHeader(ctx: Ctx, page: PDFPage, section: PdfSection) {
  page.drawText("LA VAGUE IMPORTS  ·  INTERNATIONAL TASTES", { x: MARGIN, y: PAGE_H - 48, size: 7.5, font: ctx.sansBold, color: OLIVE_MID });
  let hx = MARGIN;
  const headerFlag = ctx.flags.get(section.name);
  if (headerFlag) {
    const fw = 27;
    const fh = (headerFlag.height / headerFlag.width) * fw;
    page.drawImage(headerFlag, { x: MARGIN, y: PAGE_H - 76, width: fw, height: fh });
    page.drawRectangle({ x: MARGIN, y: PAGE_H - 76, width: fw, height: fh, borderColor: LINE, borderWidth: 0.5 });
    hx = MARGIN + fw + 11;
  }
  page.drawText(section.name, { x: hx, y: PAGE_H - 73, size: 23, font: ctx.serif, color: OLIVE });
  page.drawRectangle({ x: MARGIN, y: PAGE_H - 88, width: 46, height: 2.5, color: OLIVE });
  page.drawLine({ start: { x: MARGIN + 54, y: PAGE_H - 87 }, end: { x: PAGE_W - MARGIN, y: PAGE_H - 87 }, thickness: 0.75, color: LINE });
}

/** One compact list row (name · size · SKU) for a variation-list subgroup. */
function drawListItem(ctx: Ctx, page: PDFPage, prod: PdfProduct, x: number, yTop: number, colW: number) {
  const y = yTop - 9;
  const nm = prod.name.replace(/^marrakesh\s+/i, "");
  const right = [prod.size, prod.sku].filter(Boolean).join("  ·  ");
  const rW = right ? ctx.sans.widthOfTextAtSize(right, 6.5) : 0;
  if (right) page.drawText(right, { x: x + colW - rW, y, size: 6.5, font: ctx.sans, color: GRAY });
  const nmMax = colW - (rW ? rW + 8 : 0);
  page.drawText(wrap(nm, ctx.sansBold, 7.5, nmMax, 1)[0] ?? nm, { x, y, size: 7.5, font: ctx.sansBold, color: OLIVE });
  page.drawLine({ start: { x, y: yTop - 13 }, end: { x: x + colW, y: yTop - 13 }, thickness: 0.3, color: LINE });
}

/** A category sub-divider inside a section: label + rule. */
function drawSubdivider(ctx: Ctx, page: PDFPage, label: string, yTop: number) {
  const up = label.toUpperCase();
  page.drawText(up, { x: MARGIN, y: yTop - 12, size: 9, font: ctx.sansBold, color: OLIVE_MID });
  const lw = ctx.sansBold.widthOfTextAtSize(up, 9);
  page.drawLine({ start: { x: MARGIN + lw + 10, y: yTop - 9 }, end: { x: PAGE_W - MARGIN, y: yTop - 9 }, thickness: 0.6, color: LINE });
}

/**
 * Flows sections (each a country or category) with category sub-dividers,
 * breaking pages as needed. draw:false measures per-section page counts for the
 * TOC; draw:true renders. Returns pages used per section.
 */
async function renderSections(ctx: Ctx, sections: PdfSection[], opts: { draw: boolean; startAbs: number }): Promise<number[]> {
  const gap = 16;
  const rowGap = 16;
  const rowH = 138;
  const contentTop = PAGE_H - 100;
  const bottom = 60;
  const subH = 24;
  const subGap = 6;

  const perSection: number[] = [];
  let absPage = opts.startAbs;

  for (const section of sections) {
    let page: PDFPage | null = null;
    let y = 0;
    let used = 0;
    const newPage = () => {
      if (opts.draw) {
        page = ctx.doc.addPage([PAGE_W, PAGE_H]);
        drawSectionHeader(ctx, page, section);
        footer(page, ctx, absPage);
      }
      used++;
      absPage++;
      y = contentTop;
    };
    newPage();

    for (const sub of section.subgroups) {
      if (!sub.products.length) continue;
      if (sub.label) {
        if (y - subH - rowH < bottom) newPage();
        if (opts.draw && page) drawSubdivider(ctx, page, sub.label, y);
        y -= subH;
      }
      const isList = !!sub.list;
      const cols = isList ? 2 : COLS;
      const colGap = isList ? 26 : gap;
      const rH = isList ? 14 : rowH;
      const rGap = isList ? 3 : rowGap;
      const cW = (PAGE_W - MARGIN * 2 - colGap * (cols - 1)) / cols;
      for (let i = 0; i < sub.products.length; i += cols) {
        if (y - rH < bottom) newPage();
        if (opts.draw && page) {
          const rowProds = sub.products.slice(i, i + cols);
          for (let col = 0; col < rowProds.length; col++) {
            const px = MARGIN + col * (cW + colGap);
            if (isList) drawListItem(ctx, page, rowProds[col], px, y, cW);
            else await drawCard(ctx, page, rowProds[col], px, y, cW, rH);
          }
        }
        y -= rH + rGap;
      }
      y -= subGap;
    }
    perSection.push(used);
  }
  return perSection;
}

function drawOrderPages(ctx: Ctx, sections: PdfSection[], input: CatalogPdfInput, startPage: number) {
  const all = sections.flatMap((s) => s.subgroups.flatMap((g) => g.products));
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

  const sections: PdfSection[] = input.sections
    .map((s) => ({
      name: ascii(s.name),
      subgroups: s.subgroups
        .filter((g) => g.products.length > 0)
        .map((g) => ({
          label: ascii(g.label),
          products: g.products.map((p) => ({
            ...p,
            name: ascii(p.name),
            sku: ascii(p.sku),
            size: ascii(p.size),
            meta: ascii(p.meta),
            origin: p.origin,
          })),
        })),
    }))
    .filter((s) => s.subgroups.length > 0);
  const coverInput = { ...input, scopeLabel: ascii(input.scopeLabel), dateLabel: ascii(input.dateLabel) };

  // Page math: cover(1) + toc(tocPages) + sections(measured) + order.
  const tocPages = Math.max(1, Math.ceil((sections.length + 1) / 34));
  const firstSectionPage = 1 + tocPages + 1;
  const perSection = await renderSections(ctx, sections, { draw: false, startAbs: firstSectionPage });

  let cursor = firstSectionPage;
  const tocEntries: { name: string; page: number }[] = [];
  sections.forEach((s, i) => {
    tocEntries.push({ name: s.name, page: cursor });
    cursor += perSection[i];
  });
  const orderStart = cursor;
  tocEntries.push({ name: "Order form", page: orderStart });

  await drawCover(ctx, coverInput);
  drawTOC(ctx, tocEntries.map((e) => ({ name: ascii(e.name), page: e.page })), tocPages);
  await renderSections(ctx, sections, { draw: true, startAbs: firstSectionPage });
  drawOrderPages(ctx, sections, input, orderStart);

  return doc.save();
}
