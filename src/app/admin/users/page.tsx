import { redirect } from "next/navigation";

import { NewUserForm } from "@/components/admin/new-user-form";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

export default async function AdminUsers() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "ADMIN") redirect("/admin");

  const prisma = getPrisma();
  const users = prisma
    ? await prisma.adminUser.findMany({ orderBy: { createdAt: "asc" } })
    : [];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl text-olive-900">Users</h1>
      <p className="mt-1 mb-6 text-sm text-olive-600">People who can sign in to the admin.</p>

      <div className="mb-8 overflow-hidden rounded-xl border border-olive-100 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-olive-100 bg-olive-50/60 text-left text-olive-600">
            <tr>
              <th className="p-3">Email</th>
              <th className="p-3">Name</th>
              <th className="p-3">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-olive-50 last:border-0">
                <td className="p-3 text-olive-900">{u.email}</td>
                <td className="p-3 text-olive-600">{u.name ?? "—"}</td>
                <td className="p-3">
                  <span className="rounded bg-olive-100 px-2 py-0.5 text-xs text-olive-700">{u.role}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-olive-800">Add a user</h2>
      <NewUserForm />
    </div>
  );
}
