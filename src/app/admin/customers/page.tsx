import { redirect } from "next/navigation";

import { ComingSoon } from "@/components/admin/coming-soon";
import { getCurrentUser } from "@/lib/auth";

export default async function AdminCustomers() {
  if (!(await getCurrentUser())) redirect("/admin/login");
  return (
    <ComingSoon
      title="Customers"
      blurb="Canonical business accounts — one account per company, with contacts, assigned account executive, pricing tier, and full history."
      bullets={["Business accounts & contacts", "Assigned account executive", "Account-specific pricing", "Quotes / orders / invoices / activity"]}
    />
  );
}
