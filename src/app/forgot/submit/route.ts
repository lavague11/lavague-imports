import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { requirePrisma } from "@/lib/db";
import { passwordResetEmail, sendEmail } from "@/lib/mail";

// Request a password reset. Always redirects to the same neutral "sent" page so
// the form can't be used to discover which emails have accounts.
const RESET_TTL_MIN = 30;

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const done = () =>
    new NextResponse(null, { status: 303, headers: { Location: "/forgot?sent=1" } });

  if (!email) return done();

  try {
    const prisma = requirePrisma();
    const customer = await prisma.customer.findUnique({ where: { email } });
    if (customer) {
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + RESET_TTL_MIN * 60_000);
      await prisma.passwordResetToken.create({
        data: { token, customerId: customer.id, expiresAt },
      });
      const url = `${new URL(request.url).origin}/reset?token=${token}`;
      const mail = passwordResetEmail(url);
      const result = await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
      if (!result.ok) {
        // SMTP/Resend not configured (or failed) — log the link so it still works
        // in dev and until sales@ SMTP creds land. See docs/blocked.md.
        console.warn(`[password-reset] email not sent (${result.reason}); link for ${email}: ${url}`);
      }
    }
  } catch (error) {
    console.error("[password-reset] error:", error instanceof Error ? error.message : error);
  }
  return done();
}
