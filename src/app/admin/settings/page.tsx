import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

export default async function AdminSettings() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");

  const cards = [
    { href: "/developers", label: "Integrations & API keys", blurb: "Google Maps, sign-in, calendar, the key vault, and the catalog API.", external: false },
    { href: "/admin/users", label: "Users & roles", blurb: "Admin and account-executive accounts.", external: false },
    { href: "/admin/account", label: "Your account", blurb: "Change your password and profile.", external: false },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl text-olive-900">Settings</h1>
      <p className="mt-1 text-sm text-olive-600">Signed in as {user.email}.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-xl border border-olive-100 bg-white p-5 transition-colors hover:border-olive-300"
          >
            <h2 className="text-base font-semibold text-olive-950">{c.label}</h2>
            <p className="mt-1 text-sm text-olive-600">{c.blurb}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
