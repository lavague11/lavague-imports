import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

const ERRORS: Record<string, string> = {
  invalid: "Incorrect email or password.",
  db: "Sign-in is unavailable — is the database connected?",
};

const fieldClass =
  "h-11 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/admin");
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/admin";
  const errorCode = typeof params.error === "string" ? params.error : null;
  const errorMessage = errorCode ? (ERRORS[errorCode] ?? "Something went wrong.") : null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-olive-100 bg-white p-8 shadow-sm">
        <h1 className="font-display text-2xl text-olive-900">
          La Vague <span className="text-olive-600">Admin</span>
        </h1>
        <p className="mt-1 mb-6 text-sm text-olive-600">
          Sign in to manage the catalog.
        </p>

        {/* Plain form POST (Post/Redirect/Get) — a full-page navigation, not a
            Server Action, so the redirect can't trip the client error boundary. */}
        <form action="/admin/login/submit" method="post" className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-olive-800">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-olive-800">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={fieldClass}
            />
          </div>
          {errorMessage ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {errorMessage}
            </p>
          ) : null}
          <button
            type="submit"
            className="h-11 w-full rounded-lg bg-olive-900 text-sm font-medium text-white hover:bg-olive-800"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
