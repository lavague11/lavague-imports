import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";

// Assign a customer to an invoice: pick an existing one, create a new one inline
// (business name first, optional Google-Places address), or clear it. Full-page
// POST (Post/Redirect/Get) — host-safe, never a Server Action.

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

const slugify = (s: string) =>
  (s || "customer").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "customer";

const clean = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const orNull = (v: FormDataEntryValue | null) => clean(v) || null;
const numOrNull = (v: FormDataEntryValue | null) => {
  const n = Number(clean(v));
  return Number.isFinite(n) && clean(v) !== "" ? n : null;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return redirectTo("/admin/login");
  }

  const { id } = await params;
  const fd = await request.formData();
  const mode = clean(fd.get("mode"));

  try {
    const prisma = requirePrisma();
    const invoice = await prisma.customerInvoice.findUnique({ where: { id }, select: { id: true } });
    if (!invoice) return redirectTo("/admin/invoices");

    if (mode === "unassign") {
      await prisma.customerInvoice.update({ where: { id }, data: { customerId: null } });
      return redirectTo(`/admin/invoices/${id}/edit?customer=cleared`);
    }

    if (mode === "existing") {
      const customerId = clean(fd.get("customerId"));
      if (!customerId) return redirectTo(`/admin/invoices/${id}/edit?error=customer`);
      const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
      if (!customer) return redirectTo(`/admin/invoices/${id}/edit?error=customer`);
      await prisma.customerInvoice.update({ where: { id }, data: { customerId } });
      return redirectTo(`/admin/invoices/${id}/edit?customer=set`);
    }

    if (mode === "new") {
      const businessName = clean(fd.get("businessName"));
      const name = orNull(fd.get("name"));
      if (!businessName && !name) return redirectTo(`/admin/invoices/${id}/edit?error=customer`);

      // Email is unique + required by the schema. Use the real one if free,
      // otherwise a clearly-fake placeholder (same convention as the importer).
      let email = clean(fd.get("email")).toLowerCase();
      if (!email || (await prisma.customer.findUnique({ where: { email }, select: { id: true } }))) {
        const base = slugify(businessName || name || "customer");
        let candidate = `${base}@contacts.invalid`;
        let n = 2;
        while (await prisma.customer.findUnique({ where: { email: candidate }, select: { id: true } })) {
          candidate = `${base}-${n++}@contacts.invalid`;
        }
        email = candidate;
      }

      const created = await prisma.customer.create({
        data: {
          email,
          name,
          businessName: businessName || null,
          phone: orNull(fd.get("phone")),
          role: "WHOLESALE",
          street: orNull(fd.get("street")),
          unit: orNull(fd.get("unit")),
          city: orNull(fd.get("city")),
          state: orNull(fd.get("state")),
          zip: orNull(fd.get("zip")),
          lat: numOrNull(fd.get("lat")),
          lng: numOrNull(fd.get("lng")),
          placeId: orNull(fd.get("placeId")),
        },
        select: { id: true },
      });
      await prisma.customerInvoice.update({ where: { id }, data: { customerId: created.id } });
      return redirectTo(`/admin/invoices/${id}/edit?customer=created`);
    }

    return redirectTo(`/admin/invoices/${id}/edit`);
  } catch (error) {
    console.error("[invoice] assign customer failed", error);
    return redirectTo(`/admin/invoices/${id}/edit?error=customer`);
  }
}
