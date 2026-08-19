import { redirect } from "next/navigation";

import { LoginForm } from "@/components/admin/login-form";
import { getCurrentUser } from "@/lib/auth";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/admin");
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/admin";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-olive-100 bg-white p-8 shadow-sm">
        <h1 className="font-display text-2xl text-olive-900">
          La Vague <span className="text-olive-600">Admin</span>
        </h1>
        <p className="mt-1 mb-6 text-sm text-olive-600">
          Sign in to manage the catalog.
        </p>
        <LoginForm next={next} />
      </div>
    </div>
  );
}
