import Link from "next/link";

import { Container } from "@/components/ui/container";

export const metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

const fieldClass =
  "h-11 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none";

export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sent = params.sent === "1";

  return (
    <Container className="flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-sm rounded-2xl border border-olive-100 bg-white p-7 shadow-sm sm:p-8">
        <h1 className="font-display text-2xl text-olive-900">Reset your password</h1>
        {sent ? (
          <>
            <p className="mt-3 text-sm text-olive-700">
              If an account exists for that email, we&apos;ve sent a link to reset your
              password. It expires in 30 minutes.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-olive-900 text-sm font-medium text-white hover:bg-olive-800"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="mt-1 mb-6 text-sm text-olive-600">
              Enter your email and we&apos;ll send you a link to set a new password.
            </p>
            <form action="/forgot/submit" method="post" className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-olive-800">
                  Email
                </label>
                <input id="email" name="email" type="email" autoComplete="email" required className={fieldClass} />
              </div>
              <button type="submit" className="h-11 w-full rounded-lg bg-olive-900 text-sm font-medium text-white hover:bg-olive-800">
                Send reset link
              </button>
            </form>
            <p className="mt-6 text-center text-sm text-olive-600">
              Remembered it?{" "}
              <Link href="/login" className="font-medium text-olive-900 underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </Container>
  );
}
