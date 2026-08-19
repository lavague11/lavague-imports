import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/components/admin/change-password-form";
import { getCurrentUser } from "@/lib/auth";

export default async function AdminAccount() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl text-olive-900">Account</h1>
      <p className="mt-1 mb-6 text-sm text-olive-600">
        {user.name ?? user.email} · {user.role}
      </p>
      <h2 className="mb-3 text-sm font-semibold text-olive-800">Change password</h2>
      <ChangePasswordForm />
    </div>
  );
}
