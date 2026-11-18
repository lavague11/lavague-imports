import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { acceptImportSuggest, ignoreImportSuggest, resetProductField } from "@/lib/admin/products";
import { revalidatePath } from "next/cache";

// Field-level hand-edit actions (PRODUCTS_UI §15): reset a field to its imported
// value, or accept / ignore a re-import's suggestion for a locked field.
// Full-page POST → 303 back to the product editor (host-safe).
function back(slug: string) {
  return new NextResponse(null, { status: 303, headers: { Location: `/admin/products/${slug}` } });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  const { slug } = await params;
  const fd = await request.formData();
  const action = String(fd.get("action") ?? "");
  const field = String(fd.get("field") ?? "");
  if (!field) return back(slug);

  try {
    if (action === "reset") await resetProductField(slug, field);
    else if (action === "accept") await acceptImportSuggest(slug, field);
    else if (action === "ignore") await ignoreImportSuggest(slug, field);
  } catch (error) {
    console.error("[admin] field action failed", action, field, error);
    return back(slug);
  }
  revalidatePath(`/admin/products/${slug}`);
  revalidatePath(`/shop/${slug}`);
  revalidatePath("/shop");
  return back(slug);
}
