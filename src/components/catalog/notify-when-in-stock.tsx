"use client";

import { useState } from "react";
import { Bell, Check } from "lucide-react";

import { cn } from "@/lib/utils";

/** Out-of-stock email capture: "notify me when it's back". Posts to
 *  /api/notify-stock and confirms inline — no navigation. */
export function NotifyWhenInStock({
  productSlug,
  productName,
  className,
}: {
  productSlug: string;
  productName: string;
  className?: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    try {
      const res = await fetch("/api/notify-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, productSlug, productName }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className={cn("rounded-card border border-olive-200 bg-olive-50 p-4", className)}>
      <p className="flex items-center gap-2 text-sm font-medium text-olive-900">
        <Bell className="h-4 w-4 text-olive-600" aria-hidden="true" />
        Out of stock
      </p>
      {status === "done" ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700">
          <Check className="h-4 w-4" aria-hidden="true" />
          Thanks — we&apos;ll email you when it&apos;s back.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-2">
          <p className="mb-2 text-sm text-olive-700">
            Leave your email and we&apos;ll let you know the moment it returns.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="h-11 w-full rounded-full border border-olive-200 px-4 text-sm text-olive-900 placeholder:text-olive-400 focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="h-11 shrink-0 rounded-full bg-olive-900 px-5 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-60"
            >
              {status === "loading" ? "Saving…" : "Notify me"}
            </button>
          </div>
          {status === "error" ? (
            <p className="mt-2 text-sm text-red-700">Something went wrong — please try again.</p>
          ) : null}
        </form>
      )}
    </div>
  );
}
