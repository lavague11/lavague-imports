import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { AccountHeader } from "@/components/account/account-header";
import { Container } from "@/components/ui/container";
import { composeAddress, mapsUrl } from "@/lib/address";
import { getCustomer } from "@/lib/customer-auth";
import { getPrisma } from "@/lib/db";
import { site } from "@/lib/site";

export const metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

const dateFmt = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default async function AccountProfile() {
  const customer = await getCustomer();
  if (!customer) redirect("/login?next=/account/profile");

  const prisma = getPrisma();
  const full = prisma ? await prisma.customer.findUnique({ where: { id: customer.id } }) : null;
  const isWholesale = customer.role === "WHOLESALE";

  const addr = full ? composeAddress(full) : null;
  const maps = full ? mapsUrl(full) : null;

  const rows: { label: string; value: React.ReactNode }[] = [
    ...(isWholesale ? [{ label: "Business", value: full?.businessName || "—" }] : []),
    { label: "Contact", value: full?.name || "—" },
    { label: "Email", value: customer.email },
    { label: "Phone", value: full?.phone || "—" },
    {
      label: "Address",
      value: addr && maps
        ? <a href={maps} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-olive-800 hover:underline">{addr} <ExternalLink className="h-3 w-3 shrink-0 text-olive-400" /></a>
        : "—",
    },
    ...(full ? [{ label: "Member since", value: dateFmt(full.createdAt) }] : []),
  ];

  return (
    <Container className="py-12 lg:py-16">
      <AccountHeader name={customer.name} email={customer.email} isWholesale={isWholesale} />

      <h2 className="mt-8 font-display text-2xl text-olive-900">Profile</h2>

      <div className="mt-4 overflow-hidden rounded-card border border-olive-100 bg-white">
        <dl className="divide-y divide-olive-50">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[7rem_1fr] gap-3 px-4 py-3 text-sm sm:grid-cols-[9rem_1fr]">
              <dt className="text-olive-500">{r.label}</dt>
              <dd className="break-words text-olive-800">{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="mt-4 text-sm text-olive-500">
        Need to update your details?{" "}
        <a href={`mailto:${site.email}?subject=Update%20my%20account%20details`} className="font-medium text-olive-800 underline">
          Email {site.email}
        </a>{" "}
        and we&apos;ll take care of it.
      </p>

      <div className="mt-6">
        <form action="/logout" method="post">
          <button className="rounded-full border border-olive-200 px-4 py-2 text-sm font-medium text-olive-700 hover:bg-olive-50">Sign out</button>
        </form>
      </div>
    </Container>
  );
}
