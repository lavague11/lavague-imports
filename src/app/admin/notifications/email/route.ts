import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";
import { backInStockEmail, mailConfigured, sendEmail } from "@/lib/mail";

const redirectTo = (pathAndQuery: string) =>
  new NextResponse(null, { status: 303, headers: { Location: pathAndQuery } });

// Emails everyone waiting on a product that it's back in stock, then marks those
// requests notified. Full-page POST (Post/Redirect/Get) so it can report a
// result banner — server-action redirects break on this host.
export async function POST(request: Request) {
  try {
    await requireUser();
  } catch {
    return redirectTo("/admin/login");
  }

  const fd = await request.formData();
  const slug = String(fd.get("productSlug") ?? "").trim();
  if (!slug) return redirectTo("/admin/notifications");
  if (!mailConfigured()) return redirectTo("/admin/notifications?error=not-configured");

  const prisma = requirePrisma();
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const pending = await prisma.stockNotification.findMany({
    where: { productSlug: slug, notified: false },
  });
  if (pending.length === 0) return redirectTo("/admin/notifications");

  const { subject, html, text } = backInStockEmail(pending[0].productName, `${base}/shop/${slug}`);
  let sent = 0;
  let failed = 0;
  for (const r of pending) {
    const res = await sendEmail({ to: r.email, subject, html, text });
    if (res.ok) {
      await prisma.stockNotification.update({ where: { id: r.id }, data: { notified: true } });
      sent++;
    } else {
      failed++;
    }
  }

  const params = new URLSearchParams({ sent: String(sent) });
  if (failed) params.set("failed", String(failed));
  return redirectTo(`/admin/notifications?${params.toString()}`);
}
