import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { TypeOptionsManager } from "@/components/admin/type-options-manager";
import { getCurrentUser } from "@/lib/auth";
import { listTypeOptions } from "@/lib/admin/product-tags";

export const metadata = { title: "Product types · Admin" };

export default async function ProductTypesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "ADMIN") redirect("/admin");

  const options = await listTypeOptions();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/products" className="inline-flex items-center gap-1.5 text-sm text-olive-600 hover:text-olive-900">
        <ArrowLeft className="h-4 w-4" /> Products
      </Link>
      <h1 className="mt-2 font-display text-2xl text-olive-900">Product types</h1>
      <p className="mt-1 mb-5 text-sm text-olive-600">The controlled list used for the <strong>Type</strong> tag on products (PRODUCT_TAGS §1). Auto-seeded from the catalog — prune or add as you like.</p>
      <TypeOptionsManager initial={options} />
    </div>
  );
}
