"use client";

import { useState } from "react";
import Link from "next/link";

const fieldClass =
  "h-11 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none";

/**
 * Two-step customer sign-in: enter email OR phone → look the account up → then
 * enter a password, or be offered to create an account when none exists.
 */
export function CustomerLogin({ next, initialError, prefillId }: { next: string; initialError?: string | null; prefillId?: string }) {
  const [identifier, setIdentifier] = useState(prefillId ?? "");
  const [step, setStep] = useState<"id" | "password" | "create">(prefillId ? "password" : "id");
  const [name, setName] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(initialError ?? null);

  const signupHref = `/login?mode=signup&id=${encodeURIComponent(identifier.trim())}${next !== "/account" ? `&next=${encodeURIComponent(next)}` : ""}`;

  const lookup = async () => {
    const id = identifier.trim();
    if (id.length < 3) { setErr("Enter your email or phone number."); return; }
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`/login/lookup?identifier=${encodeURIComponent(id)}`);
      const d = await r.json();
      if (d.found) { setName(d.name ?? null); setHasPassword(!!d.hasPassword); setStep("password"); }
      else setStep("create");
    } catch {
      setErr("We couldn't reach the account service. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const restart = () => { setStep("id"); setErr(null); };

  if (step === "id") {
    return (
      <div className="space-y-4">
        {err ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
        <div>
          <label htmlFor="identifier" className="mb-1 block text-sm font-medium text-olive-800">Email or phone</label>
          <input
            id="identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void lookup(); } }}
            autoComplete="username"
            autoFocus
            placeholder="you@example.com or (555) 123-4567"
            className={fieldClass}
          />
        </div>
        <button type="button" onClick={() => void lookup()} disabled={loading} className="h-11 w-full rounded-lg bg-olive-900 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-60">
          {loading ? "Checking…" : "Continue"}
        </button>
      </div>
    );
  }

  if (step === "create") {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-olive-100 bg-olive-50/60 px-3 py-2 text-sm text-olive-700">
          No account found for <span className="font-medium text-olive-900">{identifier.trim()}</span>.
        </p>
        <Link href={signupHref} className="flex h-11 w-full items-center justify-center rounded-lg bg-olive-900 text-sm font-medium text-white hover:bg-olive-800">
          Create an account
        </Link>
        <button type="button" onClick={restart} className="w-full text-center text-sm text-olive-600 hover:text-olive-900">Use a different email or phone</button>
      </div>
    );
  }

  // step === "password"
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-olive-100 bg-olive-50/60 px-3 py-2 text-sm">
        <span className="min-w-0 truncate text-olive-700">{name ? <>Signing in as <span className="font-medium text-olive-900">{name}</span></> : <span className="font-medium text-olive-900">{identifier.trim()}</span>}</span>
        <button type="button" onClick={restart} className="shrink-0 text-xs font-medium text-olive-600 hover:text-olive-900">Change</button>
      </div>

      {hasPassword ? (
        <form action="/login/submit" method="post" className="space-y-4">
          <input type="hidden" name="identifier" value={identifier.trim()} />
          <input type="hidden" name="next" value={next} />
          {err ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-olive-800">Password</label>
              <Link href="/forgot" className="text-xs font-medium text-olive-600 hover:text-olive-900">Forgot?</Link>
            </div>
            <input id="password" name="password" type="password" autoComplete="current-password" autoFocus required className={fieldClass} />
          </div>
          <label htmlFor="remember" className="flex items-center gap-2 text-sm text-olive-700">
            <input id="remember" name="remember" type="checkbox" defaultChecked className="h-4 w-4 rounded border-olive-300 accent-olive-800" />
            Keep me signed in for 30 days
          </label>
          <button type="submit" className="h-11 w-full rounded-lg bg-olive-900 text-sm font-medium text-white hover:bg-olive-800">Sign in</button>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">This account doesn&apos;t have a password yet. Set one to sign in.</p>
          <Link href="/forgot" className="flex h-11 w-full items-center justify-center rounded-lg bg-olive-900 text-sm font-medium text-white hover:bg-olive-800">Set a password</Link>
        </div>
      )}
    </div>
  );
}
