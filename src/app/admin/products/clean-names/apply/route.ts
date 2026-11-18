import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { saveProductEdits } from "@/lib/admin/products";

// Apply approved clean-name suggestions (PRODUCTS_UI §13). Only the slugs the
// admin left checked are renamed; each new name rides along as new__<slug>.
// Full-page POST → 303 (host-safe).
function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(request: Request) {
  let userId: string | undefined;
  try {
    const user = await requireAdmin();
    userId = user.id;
  } catch {
    return redirectTo("/admin/login");
  }

  const fd = await request.formData();
  const slugs = fd.getAll("slug").map(String).map((s) => s.trim()).filter(Boolean);

  let n = 0;
  for (const slug of slugs) {
    const name = String(fd.get(`new__${slug}`) ?? "").trim();
    if (!name) continue;
    try {
      await saveProductEdits(slug, { name }, userId);
      n++;
    } catch (error) {
      console.error("[admin] clean-name rename failed", slug, error);
    }
  }
  return redirectTo(`/admin/products/clean-names?renamed=${n}`);
}
