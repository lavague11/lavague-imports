import Link from "next/link";

import { Container } from "@/components/ui/container";
import { getPrisma } from "@/lib/db";

export const metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

const fieldClass =
  "h-11 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none";

const ERRORS: Record<string, string> = {
  weak: "Please choose a password of at least 8 characters.",
  mismatch: "Those passwords don't match.",
  invalid: "That reset link is invalid or has expired.",
};

async function tokenIsValid(token: string): Promise<boolean> {
  const prisma = getPrisma();
  if (!prisma) return false;
  try {
    const row = await prisma.passwordResetToken.findUnique({ where: { token } });
    return Boolean(row && !row.usedAt && row.expiresAt >= new Date());
  } catch {
    return false;
  }
}

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const errorCode = typeof params.error === "string" ? params.error : null;
  const valid = token ? await tokenIsValid(token) : false;

  return (
    <Container className="flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-sm rounded-2xl border border-olive-100 bg-white p-7 shadow-sm sm:p-8">
        <h1 className="font-display text-2xl text-olive-900">Choose a new password</h1>

        {!valid ? (
          <>
            <p className="mt-3 text-sm text-olive-700">
              {ERRORS.invalid} Reset links expire after 30 minutes and can be used once.
            </p>
            <Link
              href="/forgot"
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-olive-900 text-sm font-medium text-white hover:bg-olive-800"
            >
              Request a new link
            </Link>
          </>
        ) : (
          <>
            <p className="mt-1 mb-6 text-sm text-olive-600">Enter a new password for your account.</p>
            {errorCode ? (
              <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {ERRORS[errorCode] ?? "Something went wrong."}
              </p>
            ) : null}
            <form action="/reset/submit" method="post" className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium text-olive-800">New password</label>
                <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className={fieldClass} />
                <p className="mt-1 text-xs text-olive-500">At least 8 characters.</p>
              </div>
              <div>
                <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-olive-800">Confirm password</label>
                <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} className={fieldClass} />
              </div>
              <button type="submit" className="h-11 w-full rounded-lg bg-olive-900 text-sm font-medium text-white hover:bg-olive-800">
                Set new password
              </button>
            </form>
          </>
        )}
      </div>
    </Container>
  );
}
