import "server-only";

import nodemailer from "nodemailer";

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
  return process.env.MAIL_FROM || "La Vague Imports <onboarding@resend.dev>";
}

export function mailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY ||
      (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  );
}

async function sendViaResend(to: string, subject: string, html: string, text: string): Promise<SendResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: from(), to, subject, html, text }),
  });
  if (res.ok) return { ok: true };
  const body = await res.text().catch(() => "");
  return { ok: false, reason: `resend ${res.status}: ${body.slice(0, 200)}` };
}

async function sendViaSmtp(to: string, subject: string, html: string, text: string): Promise<SendResult> {
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  try {
    await transport.sendMail({ from: from(), to, subject, html, text });
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
}): Promise<SendResult> {
  const { to, subject, html, text } = opts;
  try {
    if (process.env.RESEND_API_KEY) return await sendViaResend(to, subject, html, text);
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      return await sendViaSmtp(to, subject, html, text);
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
