import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { googleOAuthConfigured } from "@/lib/integrations";

const ERRORS: Record<string, string> = {
  invalid: "Incorrect email or password.",
  db: "Sign-in is unavailable — is the database connected?",
  "not-allowed": "That Google account isn't on the admin list.",
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
  const googleReady = googleOAuthConfigured();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-olive-100 bg-white p-8 shadow-sm">
        <h1 className="font-display text-2xl text-olive-900">
          La Vague <span className="text-olive-600">Admin</span>
        </h1>
        <p className="mt-1 mb-6 text-sm text-olive-600">
          Sign in to manage the catalog.
        </p>

        {/* Sign in with Google — works without the database (see lib/auth). The
            account's email must be in ADMIN_EMAILS. */}
        {googleReady ? (
          <>
            <a
              href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-olive-200 bg-white text-sm font-medium text-olive-900 hover:bg-olive-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
                <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
                <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.44 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 4.75 12 4.75Z" />
              </svg>
              Continue with Google
            </a>
            <div className="my-5 flex items-center gap-3 text-xs text-olive-400">
              <span className="h-px flex-1 bg-olive-100" />
              or
              <span className="h-px flex-1 bg-olive-100" />
            </div>
          </>
        ) : null}

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
