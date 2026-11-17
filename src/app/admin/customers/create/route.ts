import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";
import { resolveUniqueEmail } from "@/lib/admin/customer-input";
import { parseVCards } from "@/lib/vcard";

// Create a customer from the admin form, or bulk-import from an uploaded .vcf.
// Full-page POST (Post/Redirect/Get) — host-safe, never a Server Action.

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

const clean = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const orNull = (v: FormDataEntryValue | null) => clean(v) || null;
const numOrNull = (v: FormDataEntryValue | null) => {
  const s = clean(v);
  const n = Number(s);
  return s !== "" && Number.isFinite(n) ? n : null;
};

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return redirectTo("/admin/login");
  }

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return redirectTo("/admin/customers?error=create");
  }

  try {
    const prisma = requirePrisma();

    // --- VCF import path --------------------------------------------------
    const file = fd.get("vcf");
    if (file && typeof file !== "string" && file.size > 0) {
      const text = await file.text();
      const parsed = parseVCards(text);
      if (parsed.length === 0) return redirectTo("/admin/customers?error=vcf");

      let created = 0;
      for (const c of parsed) {
        const email = await resolveUniqueEmail(prisma, { email: c.email, businessName: c.org, name: c.name });
        await prisma.customer.create({
          data: {
            email,
            name: c.name,
            businessName: c.org,
            phone: c.phone,
            role: "WHOLESALE",
            street: c.street,
            city: c.city,
            state: c.state,
            zip: c.zip,
          },
        });
        created++;
      }
      return redirectTo(`/admin/customers?imported=${created}`);
    }

    // --- Single customer form path ---------------------------------------
    const businessName = clean(fd.get("businessName"));
    const name = orNull(fd.get("name"));
    if (!businessName && !name) return redirectTo("/admin/customers?error=create");

    const email = await resolveUniqueEmail(prisma, {
      email: clean(fd.get("email")),
      businessName,
      name,
    });

    const customer = await prisma.customer.create({
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
        notes: orNull(fd.get("notes")),
      },
      select: { id: true },
    });
    return redirectTo(`/admin/customers/${customer.id}?created=1`);
  } catch (error) {
    console.error("[customer] create failed", error);
    return redirectTo("/admin/customers?error=create");
  }
}
