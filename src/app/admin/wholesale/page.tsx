import { redirect } from "next/navigation";

import { ComingSoon } from "@/components/admin/coming-soon";
import { getCurrentUser } from "@/lib/auth";

export default async function AdminWholesale() {
  if (!(await getCurrentUser())) redirect("/admin/login");
  return (
    <ComingSoon
      title="Wholesale"
      blurb="The wholesale command center — pipeline, quotes, invoices, A/R aging, and account-executive workspaces."
      bullets={["Pipeline (Lead → Active Account)", "Quotes & estimates with accept/sign", "Invoices, payments & A/R aging", "Applications review"]}
    />
  );
}
