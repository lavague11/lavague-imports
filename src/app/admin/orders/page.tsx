import { redirect } from "next/navigation";

import { ComingSoon } from "@/components/admin/coming-soon";
import { getCurrentUser } from "@/lib/auth";

export default async function AdminOrders() {
  if (!(await getCurrentUser())) redirect("/admin/login");
  return (
    <ComingSoon
      title="Orders"
      blurb="Wholesale orders — converted from accepted quotes, split across suppliers, with payment and fulfillment tracked separately."
      bullets={["Order → supplier fulfillment groups", "Payment status vs. fulfillment status", "Deliveries & proof of delivery"]}
    />
  );
}
