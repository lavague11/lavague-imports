import "server-only";

import nodemailer from "nodemailer";

import { site } from "@/lib/site";
import { formatPriceOrRequest } from "@/lib/utils";
import { getKey } from "@/lib/vault";

// Integration credentials come from the vault first, then the environment.
const cfg = (name: string): string | undefined => getKey(name);

/**
 * Sends transactional email. Picks a provider from env at call time:
 *   1. Resend   — set RESEND_API_KEY (HTTP API, no SMTP needed).
 *   2. SMTP     — set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *                 (works with Hostinger email, Gmail app passwords, etc.).
 * In both cases MAIL_FROM sets the visible sender, e.g.
 *   MAIL_FROM="La Vague Imports <sales@lavagueimports.com>".
 * Returns { ok, reason } — never throws — so callers can report status.
 */

export interface SendResult {
  ok: boolean;
  reason?: string;
}

function from(): string {
  return cfg("MAIL_FROM") || "La Vague Imports <onboarding@resend.dev>";
}

export function mailConfigured(): boolean {
  return Boolean(
    cfg("RESEND_API_KEY") ||
      (cfg("SMTP_HOST") && cfg("SMTP_USER") && cfg("SMTP_PASS")),
  );
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
  text: string,
  replyTo?: string,
): Promise<SendResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: from(),
      to,
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (res.ok) return { ok: true };
  const body = await res.text().catch(() => "");
  return { ok: false, reason: `resend ${res.status}: ${body.slice(0, 200)}` };
}

async function sendViaSmtp(
  to: string,
  subject: string,
  html: string,
  text: string,
  replyTo?: string,
): Promise<SendResult> {
  const port = Number(cfg("SMTP_PORT") || 465);
  const transport = nodemailer.createTransport({
    host: cfg("SMTP_HOST"),
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: cfg("SMTP_USER"), pass: cfg("SMTP_PASS") },
  });
  try {
    await transport.sendMail({ from: from(), to, subject, html, text, replyTo });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message.slice(0, 200) : "smtp error" };
  }
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Where replies should go — e.g. the customer, so staff can reply directly. */
  replyTo?: string;
}): Promise<SendResult> {
  const { to, subject, html, text, replyTo } = opts;
  try {
    if (cfg("RESEND_API_KEY")) return await sendViaResend(to, subject, html, text, replyTo);
    if (cfg("SMTP_HOST") && cfg("SMTP_USER") && cfg("SMTP_PASS")) {
      return await sendViaSmtp(to, subject, html, text, replyTo);
    }
    return { ok: false, reason: "not-configured" };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message.slice(0, 200) : "send error" };
  }
}

/** The back-in-stock email for one product. */
export function backInStockEmail(productName: string, url: string): { subject: string; html: string; text: string } {
  const subject = `Back in stock: ${productName}`;
  const text = `Good news — ${productName} is back in stock at La Vague Imports.\n\nView it here: ${url}\n\nYou're receiving this because you asked to be notified. — La Vague Imports`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f6f2;font-family:Arial,Helvetica,sans-serif;color:#2b2b22">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <p style="font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#6b7150;margin:0 0 16px">La Vague Imports</p>
    <h1 style="font-size:22px;color:#2f3320;margin:0 0 12px">Good news — it's back in stock</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px"><strong>${productName}</strong> is available again. Quantities can be limited, so add it to your quote list soon.</p>
    <p style="margin:0 0 28px"><a href="${url}" style="display:inline-block;background:#3a3f27;color:#fff;text-decoration:none;padding:12px 22px;border-radius:9999px;font-size:14px">View the product</a></p>
    <p style="font-size:12px;color:#8a8f70;line-height:1.5;margin:0">You're receiving this because you asked to be notified when this item returned. If that wasn't you, you can ignore this email.</p>
  </div></body></html>`;
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Staff notifications — the emails that land in the sales inbox when a customer
// submits a quote, a wholesale application, or a contact message.
// ---------------------------------------------------------------------------

/** Where staff notifications go. Overridable with SALES_EMAIL, else the site inbox. */
export function salesInbox(): string {
  return cfg("SALES_EMAIL") || site.email;
}

const esc = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Wraps notification body HTML in the shared shell. */
function shell(heading: string, bodyHtml: string, savedToDb: boolean): string {
  const warning = savedToDb
    ? ""
    : `<p style="background:#fbeaea;border:1px solid #e0a3a3;color:#8a2b2b;font-size:13px;line-height:1.5;border-radius:8px;padding:10px 12px;margin:0 0 20px"><strong>Heads up:</strong> this lead was <strong>not</strong> saved to the database (it was unreachable). It only exists in this email — record it manually.</p>`;
  return `<!doctype html><html><body style="margin:0;background:#f6f6f2;font-family:Arial,Helvetica,sans-serif;color:#2b2b22">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <p style="font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#6b7150;margin:0 0 16px">${esc(site.name)}</p>
    ${warning}
    <h1 style="font-size:20px;color:#2f3320;margin:0 0 16px">${esc(heading)}</h1>
    ${bodyHtml}
  </div></body></html>`;
}

/** Renders label/value rows as an HTML table and as aligned plain text. */
function fields(rows: Array<[string, string | null | undefined]>): { html: string; text: string } {
  const present = rows.filter(([, v]) => v != null && String(v).trim() !== "") as Array<[string, string]>;
  const html =
    `<table style="border-collapse:collapse;font-size:14px;line-height:1.5;margin:0 0 20px">` +
    present
      .map(
        ([label, value]) =>
          `<tr><td style="padding:4px 16px 4px 0;color:#6b7150;vertical-align:top;white-space:nowrap">${esc(label)}</td><td style="padding:4px 0;color:#2b2b22">${esc(value)}</td></tr>`,
      )
      .join("") +
    `</table>`;
  const text = present.map(([label, value]) => `${label}: ${value}`).join("\n");
  return { html, text };
}

export interface QuoteNotificationItem {
  productName: string;
  variantName?: string | null;
  sku?: string | null;
  quantity: number;
  unitPriceCents: number | null;
  lineTotalCents: number | null;
}

export interface QuoteNotificationInput {
  reference: string;
  name: string;
  email: string;
  phone: string;
  company?: string | null;
  customerType: string;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  deliveryPostalCode?: string | null;
  message?: string | null;
  items: QuoteNotificationItem[];
  estimatedTotalCents: number;
  savedToDb: boolean;
}

/** The staff notification for a new quote request. */
export function quoteNotificationEmail(q: QuoteNotificationInput): { subject: string; html: string; text: string } {
  const subject = `New quote request ${q.reference} — ${q.name}`;
  const delivery = [q.deliveryCity, q.deliveryState, q.deliveryPostalCode].filter(Boolean).join(", ");
  const info = fields([
    ["Reference", q.reference],
    ["Customer", q.customerType === "WHOLESALE" ? "Wholesale" : "Retail"],
    ["Name", q.name],
    ["Company", q.company],
    ["Email", q.email],
    ["Phone", q.phone],
    ["Deliver to", delivery],
    ["Message", q.message],
  ]);

  const lineText = (i: QuoteNotificationItem) => {
    const name = i.variantName ? `${i.productName} — ${i.variantName}` : i.productName;
    const unit = formatPriceOrRequest(i.unitPriceCents);
    const total = formatPriceOrRequest(i.lineTotalCents);
    return `  ${i.quantity} × ${name}${i.sku ? ` (${i.sku})` : ""} — ${unit} ea → ${total}`;
  };
  const itemsHtml =
    `<table style="border-collapse:collapse;width:100%;font-size:14px;margin:0 0 8px">` +
    `<tr style="text-align:left;color:#6b7150"><th style="padding:6px 8px 6px 0;font-weight:600">Qty</th><th style="padding:6px 8px;font-weight:600">Item</th><th style="padding:6px 0 6px 8px;font-weight:600;text-align:right">Line total</th></tr>` +
    q.items
      .map((i) => {
        const name = i.variantName ? `${esc(i.productName)} — ${esc(i.variantName)}` : esc(i.productName);
        const sku = i.sku ? `<br><span style="color:#8a8f70;font-size:12px">${esc(i.sku)}</span>` : "";
        return `<tr style="border-top:1px solid #e6e6dc"><td style="padding:6px 8px 6px 0;vertical-align:top">${i.quantity}</td><td style="padding:6px 8px;vertical-align:top">${name}${sku}</td><td style="padding:6px 0 6px 8px;text-align:right;vertical-align:top">${esc(formatPriceOrRequest(i.lineTotalCents))}</td></tr>`;
      })
      .join("") +
    `</table>`;

  const totalLabel = formatPriceOrRequest(q.estimatedTotalCents);
  const body = `${info.html}
    <h2 style="font-size:15px;color:#2f3320;margin:0 0 8px">Items (${q.items.length})</h2>
    ${itemsHtml}
    <p style="font-size:15px;margin:8px 0 0"><strong>Estimated total: ${esc(totalLabel)}</strong> <span style="color:#8a8f70;font-size:12px">(priced lines only)</span></p>`;

  const text = `New quote request ${q.reference}\n\n${info.text}\n\nItems (${q.items.length}):\n${q.items.map(lineText).join("\n")}\n\nEstimated total (priced lines only): ${totalLabel}${q.savedToDb ? "" : "\n\n⚠ NOT saved to the database — record this lead manually."}`;
  return { subject, html: shell("New quote request", body, q.savedToDb), text };
}

export interface WholesaleNotificationInput {
  reference: string;
  businessName: string;
  businessType: string;
  contactName: string;
  email: string;
  phone: string;
  website?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  taxId?: string | null;
  resaleCertNumber?: string | null;
  estimatedMonthlyVolume?: string | null;
  productInterest: string[];
  message?: string | null;
  savedToDb: boolean;
}

/** The staff notification for a new wholesale application. */
export function wholesaleNotificationEmail(a: WholesaleNotificationInput): { subject: string; html: string; text: string } {
  const subject = `New wholesale application ${a.reference} — ${a.businessName}`;
  const address = [a.addressLine1, a.addressLine2, `${a.city}, ${a.state} ${a.postalCode}`].filter(Boolean).join("\n");
  const info = fields([
    ["Reference", a.reference],
    ["Business", a.businessName],
    ["Type", a.businessType],
    ["Contact", a.contactName],
    ["Email", a.email],
    ["Phone", a.phone],
    ["Website", a.website],
    ["Address", address],
    ["Tax ID", a.taxId],
    ["Resale cert", a.resaleCertNumber],
    ["Est. monthly volume", a.estimatedMonthlyVolume],
    ["Interested in", a.productInterest.length ? a.productInterest.join(", ") : null],
    ["Message", a.message],
  ]);
  const text = `New wholesale application ${a.reference}\n\n${info.text}${a.savedToDb ? "" : "\n\n⚠ NOT saved to the database — record this lead manually."}`;
  return { subject, html: shell("New wholesale application", info.html, a.savedToDb), text };
}

export interface ContactNotificationInput {
  reference: string;
  name: string;
  email: string;
  phone?: string | null;
  topic: string;
  message: string;
  savedToDb: boolean;
}

/** The staff notification for a new contact message. */
export function contactNotificationEmail(c: ContactNotificationInput): { subject: string; html: string; text: string } {
  const subject = `New message ${c.reference} — ${c.name} (${c.topic})`;
  const info = fields([
    ["Reference", c.reference],
    ["Topic", c.topic],
    ["Name", c.name],
    ["Email", c.email],
    ["Phone", c.phone],
  ]);
  const body = `${info.html}
    <h2 style="font-size:15px;color:#2f3320;margin:0 0 8px">Message</h2>
    <p style="font-size:14px;line-height:1.6;white-space:pre-wrap;margin:0">${esc(c.message)}</p>`;
  const text = `New contact message ${c.reference}\n\n${info.text}\n\nMessage:\n${c.message}${c.savedToDb ? "" : "\n\n⚠ NOT saved to the database — record this lead manually."}`;
  return { subject, html: shell("New contact message", body, c.savedToDb), text };
}
