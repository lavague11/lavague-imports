import Link from "next/link";
import { redirect } from "next/navigation";

import { Container } from "@/components/ui/container";
import { getCurrentUser } from "@/lib/auth";
import { getCustomer } from "@/lib/customer-auth";
import { googleOAuthConfigured } from "@/lib/integrations";

export const metadata = {
  title: "Sign in",
  description: "Sign in to La Vague Imports to track orders and manage your account.",
};

const ERRORS: Record<string, string> = {
  invalid: "Incorrect email or password.",
  exists: "An account with that email already exists — sign in instead.",
  weak: "Please choose a password of at least 8 characters.",
  email: "Please enter a valid email address.",
  db: "We couldn't reach the account service just now. Please try again in a moment.",
  mismatch: "Those passwords don't match.",
};

const fieldClass =
  "h-11 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none";

function safeNext(value: string | string[] | undefined): string {
  const next = typeof value === "string" ? value : "";
  // Only same-site relative paths, and never back into an auth page.
  if (!next.startsWith("/") || next.startsWith("//")) return "/account";
  if (next.startsWith("/login") || next.startsWith("/signup")) return "/account";
  return next;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);

  // Already signed in? Send them on.
  const [customer, admin] = await Promise.all([getCustomer(), getCurrentUser()]);
  if (customer) redirect(next);
  if (admin) redirect("/admin");

  const mode = params.mode === "signup" ? "signup" : "signin";
  const errorCode = typeof params.error === "string" ? params.error : null;
  const errorMessage = errorCode ? (ERRORS[errorCode] ?? "Something went wrong.") : null;
  const googleReady = googleOAuthConfigured();

  const withNext = (base: string) =>
    next !== "/account" ? `${base}${base.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}` : base;

  return (
    <Container className="flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-sm rounded-2xl border border-olive-100 bg-white p-7 shadow-sm sm:p-8">
        <h1 className="font-display text-2xl text-olive-900">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1 mb-6 text-sm text-olive-600">
          {mode === "signup"
            ? "Track orders, reorder faster, and apply for wholesale."
            : "Sign in to your La Vague Imports account."}
        </p>

        {googleReady ? (
          <>
            <a
              href={withNext("/api/auth/google/start")}
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

        {errorMessage ? (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {errorMessage}
          </p>
        ) : null}

        {mode === "signup" ? (
          <form action="/signup/submit" method="post" className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-olive-800">Name</label>
              <input id="name" name="name" autoComplete="name" autoCapitalize="words" className={fieldClass} />
            </div>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-olive-800">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" required className={fieldClass} />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-olive-800">Password</label>
              <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className={fieldClass} />
              <p className="mt-1 text-xs text-olive-500">At least 8 characters.</p>
            </div>
            <button type="submit" className="h-11 w-full rounded-lg bg-olive-900 text-sm font-medium text-white hover:bg-olive-800">
              Create account
            </button>
          </form>
        ) : (
          <form action="/login/submit" method="post" className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-olive-800">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" required className={fieldClass} />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-olive-800">Password</label>
                <Link href="/forgot" className="text-xs font-medium text-olive-600 hover:text-olive-900">Forgot?</Link>
              </div>
              <input id="password" name="password" type="password" autoComplete="current-password" required className={fieldClass} />
            </div>
            <button type="submit" className="h-11 w-full rounded-lg bg-olive-900 text-sm font-medium text-white hover:bg-olive-800">
              Sign in
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-olive-600">
          {mode === "signup" ? (
            <>Already have an account?{" "}
              <Link href={withNext("/login")} className="font-medium text-olive-900 underline underline-offset-4">Sign in</Link>
            </>
          ) : (
            <>New to La Vague?{" "}
              <Link href={withNext("/login?mode=signup")} className="font-medium text-olive-900 underline underline-offset-4">Create an account</Link>
            </>
          )}
        </p>
      </div>
    </Container>
  );
}
