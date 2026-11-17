import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { site } from "@/lib/site";
import { formatPrice } from "@/lib/utils";

export interface InvoicePdfLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface InvoicePdfData {
  number: string;
  statusLabel: string;
  issueDate: Date;
  dueDate: Date | null;
  terms: string | null;
  poNumber: string | null;
  billToName: string;
  billToContact: string | null;
  billToEmail: string | null;
  billToAddress: string | null;
  lines: InvoicePdfLine[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  notes: string | null;
  signerName: string | null;
  signedAt: Date | null;
  /// PNG/JPEG data-URL of the drawn signature, embedded on the signature line.
  signatureData: string | null;
}

const OLIVE = rgb(0.227, 0.247, 0.153);
const MUTED = rgb(0.45, 0.47, 0.38);
const LINE = rgb(0.85, 0.86, 0.8);
const DANGER = rgb(0.72, 0.18, 0.18);

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Builds a clean one-page PDF invoice. No external service required. */
export async function buildInvoicePdf(inv: InvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const M = 50;
  const right = width - M;

  // Helvetica uses WinAnsi (CP1252); map common punctuation to ASCII and drop
  // anything outside Latin-1 so a stray glyph can't 500 the whole PDF.
  const sanitize = (s: string) =>
    s
      .replace(/[‒-―−]/g, "-")
      .replace(/[‘’‛]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/…/g, "...")
      .replace(/[^\x00-\xFF]/g, "?");

  const text = (
    s: string,
    x: number,
    y: number,
    opts: { size?: number; font?: typeof font; color?: ReturnType<typeof rgb> } = {},
  ) => {
    page.drawText(sanitize(s), { x, y, size: opts.size ?? 10, font: opts.font ?? font, color: opts.color ?? OLIVE });
  };
  const textR = (
    s: string,
    xRight: number,
    y: number,
    opts: { size?: number; font?: typeof font; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const f = opts.font ?? font;
    const size = opts.size ?? 10;
    text(s, xRight - f.widthOfTextAtSize(sanitize(s), size), y, opts);
  };

  let y = height - M;

  // Header: brand (left) / INVOICE (right)
  text("LA VAGUE IMPORTS", M, y, { size: 18, font: bold });
  textR("INVOICE", right, y + 2, { size: 22, font: bold, color: OLIVE });
  y -= 16;
  text("Fine North African & Middle Eastern foods", M, y, { size: 9, color: MUTED });
  textR(inv.number, right, y, { size: 11, font: bold });
  y -= 13;
  textR(inv.statusLabel, right, y, { size: 9, color: MUTED });

  y -= 30;
  page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 1, color: LINE });
  y -= 22;

  // Bill-to (left) + meta (right)
  const metaTop = y;
  text("BILL TO", M, y, { size: 8, font: bold, color: MUTED });
  let by = y - 15;
  text(inv.billToName, M, by, { size: 11, font: bold });
  by -= 14;
  for (const line of [inv.billToContact, inv.billToEmail, inv.billToAddress]) {
    if (!line) continue;
    text(line, M, by, { size: 9, color: MUTED });
    by -= 13;
  }

  const metaX = 370;
  const metaRows: [string, string][] = [
    ["Issue date", fmtDate(inv.issueDate)],
    ["Due date", inv.dueDate ? fmtDate(inv.dueDate) : "—"],
    ["Terms", inv.terms || "—"],
  ];
  if (inv.poNumber) metaRows.push(["PO number", inv.poNumber]);
  let my = metaTop;
  for (const [k, v] of metaRows) {
    text(k, metaX, my, { size: 9, color: MUTED });
    textR(v, right, my, { size: 9, font: bold });
    my -= 15;
  }

  y = Math.min(by, my) - 18;

  // Line-item table
  const colQty = 360;
  const colUnit = 455;
  const colAmt = right;
  page.drawRectangle({ x: M, y: y - 4, width: right - M, height: 20, color: rgb(0.96, 0.96, 0.93) });
  text("DESCRIPTION", M + 6, y + 2, { size: 8, font: bold, color: MUTED });
  textR("QTY", colQty, y + 2, { size: 8, font: bold, color: MUTED });
  textR("UNIT", colUnit, y + 2, { size: 8, font: bold, color: MUTED });
  textR("AMOUNT", colAmt, y + 2, { size: 8, font: bold, color: MUTED });
  y -= 22;

  for (const l of inv.lines) {
    const desc = l.description.length > 58 ? l.description.slice(0, 57) + "…" : l.description;
    text(desc, M + 6, y, { size: 10 });
    textR(String(l.quantity), colQty, y, { size: 10, color: MUTED });
    textR(formatPrice(l.unitPriceCents), colUnit, y, { size: 10, color: MUTED });
    textR(formatPrice(l.lineTotalCents), colAmt, y, { size: 10 });
    y -= 10;
    page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 0.5, color: LINE });
    y -= 12;
  }

  // Totals (right column)
  y -= 6;
  const totalRow = (label: string, value: string, opts: { bold?: boolean; danger?: boolean } = {}) => {
    const f = opts.bold ? bold : font;
    const color = opts.danger ? DANGER : opts.bold ? OLIVE : MUTED;
    text(label, colUnit - 70, y, { size: 10, color: opts.bold ? OLIVE : MUTED, font: opts.bold ? bold : font });
    textR(value, colAmt, y, { size: 10, font: f, color });
    y -= 16;
  };
  totalRow("Subtotal", formatPrice(inv.subtotalCents));
  if (inv.discountCents > 0) totalRow("Discount", `-${formatPrice(inv.discountCents)}`);
  if (inv.shippingCents > 0) totalRow("Delivery", formatPrice(inv.shippingCents));
  if (inv.taxCents > 0) totalRow("Tax", formatPrice(inv.taxCents));
  page.drawLine({ start: { x: colUnit - 70, y: y + 6 }, end: { x: colAmt, y: y + 6 }, thickness: 0.5, color: LINE });
  totalRow("Total", formatPrice(inv.totalCents), { bold: true });
  if (inv.paidCents > 0) totalRow("Paid", `-${formatPrice(inv.paidCents)}`);
  const balance = inv.totalCents - inv.paidCents;
  if (balance > 0) totalRow("Balance due", formatPrice(balance), { bold: true, danger: true });
  else if (inv.totalCents > 0) totalRow("Balance due", formatPrice(0), { bold: true });

  // Notes
  if (inv.notes) {
    y -= 14;
    text("NOTES", M, y, { size: 8, font: bold, color: MUTED });
    y -= 14;
    for (const chunk of wrap(inv.notes, 95)) {
      text(chunk, M, y, { size: 9, color: MUTED });
      y -= 12;
    }
  }

  // Signature block — a signature line + date line near the bottom of the page.
  const lineY = 140;
  page.drawLine({ start: { x: M, y: lineY }, end: { x: 260, y: lineY }, thickness: 0.8, color: LINE });
  text("Signature", M, lineY - 12, { size: 8, font: bold, color: MUTED });
  page.drawLine({ start: { x: 320, y: lineY }, end: { x: right, y: lineY }, thickness: 0.8, color: LINE });
  text("Date", 320, lineY - 12, { size: 8, font: bold, color: MUTED });

  if (inv.signerName && inv.signedAt) {
    let placed = false;
    const d = inv.signatureData;
    if (d && d.startsWith("data:image")) {
      try {
        const png = d.includes("image/png") ? await doc.embedPng(d) : await doc.embedJpg(d);
        const scale = Math.min(190 / png.width, 48 / png.height, 1);
        page.drawImage(png, { x: M + 2, y: lineY + 4, width: png.width * scale, height: png.height * scale });
        placed = true;
      } catch {
        /* unreadable signature image — fall back to the typed name */
      }
    }
    if (!placed) text(inv.signerName, M + 4, lineY + 8, { size: 15, font: bold, color: OLIVE });
    text(fmtDate(inv.signedAt), 324, lineY + 6, { size: 10 });
    text(`Accepted electronically by ${inv.signerName} on ${fmtDate(inv.signedAt)}.`, M, lineY - 26, { size: 8, color: MUTED });
  }

  // Footer
  const foot = 56;
  page.drawLine({ start: { x: M, y: foot + 14 }, end: { x: right, y: foot + 14 }, thickness: 0.5, color: LINE });
  text(`${site.name}`, M, foot, { size: 8, color: MUTED });
  textR(`${site.email}`, right, foot, { size: 8, color: MUTED });
  text("Remit by check or ACH. Thank you for your business.", M, foot - 12, { size: 8, color: MUTED });

  return doc.save();
}

function wrap(s: string, width: number): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 6);
}
