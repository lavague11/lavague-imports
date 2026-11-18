import type { Metadata } from "next";

import { AdminNav } from "@/components/admin/admin-nav";
import { GlobalSearch } from "@/components/admin/global-search";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Admin · La Vague Imports",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // Signed out (e.g. the login page): render bare, no chrome.
  if (!user) {
    return (
      <div className="min-h-screen bg-olive-50 text-olive-900">{children}</div>
    );
  }

  return (
    <div className="min-h-screen bg-olive-50 text-olive-900">
      <AdminNav email={user.email} isAdmin={user.role === "ADMIN"} />
      <div className="mx-auto flex max-w-6xl justify-end px-4 pt-3">
        <GlobalSearch />
      </div>
      <main className="mx-auto max-w-6xl px-4 pb-8 pt-2">{children}</main>
    </div>
  );
}
