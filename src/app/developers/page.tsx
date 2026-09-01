import type { Metadata } from "next";
import { CalendarDays, KeyRound, LogOut, MapPin } from "lucide-react";

import { ApiConsole } from "@/components/dev/api-console";
import { CopyField } from "@/components/dev/copy-field";
import { VaultManager } from "@/components/dev/vault-manager";
import { Container } from "@/components/ui/container";
import { getGoogleUser } from "@/lib/google-session";
import {
  getIntegrations,
  googleOAuthConfigured,
  googleRedirectUri,
  siteUrl,
  type Integration,
} from "@/lib/integrations";

export const metadata: Metadata = {
  title: "Developer portal",
  description: "Integrations and API reference for La Vague Imports.",
  robots: { index: false, follow: false },
};

const ICONS: Record<string, typeof MapPin> = {
  "google-maps": MapPin,
  "google-auth": KeyRound,
  "google-calendar": CalendarDays,
};

const STATUS: Record<Integration["status"], { label: string; cls: string }> = {
  live: { label: "Configured", cls: "bg-emerald-100 text-emerald-800" },
  "needs-keys": { label: "Needs keys", cls: "bg-amber-100 text-amber-800" },
  scaffolded: { label: "Scaffolded", cls: "bg-olive-100 text-olive-700" },
};

export default async function DevelopersPage() {
  const integrations = getIntegrations();
  const user = await getGoogleUser();
  const authReady = googleOAuthConfigured();
  const base = siteUrl();

  return (
    <Container className="py-12">
      <header className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-olive-600">
          Developer portal
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-olive-950">
          Integrations &amp; APIs
        </h1>
        <p className="mt-3 text-olive-700">
          Wire up third-party services and build against the catalog API. Status below
          reflects the environment variables currently set — secret values are never
          shown here.
        </p>
      </header>

      {/* API key vault */}
      <section className="mt-10">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-olive-950">API Keys</h2>
          <p className="mt-1 text-sm text-olive-600">
            Central vault for every integration key. Add or replace keys here and the app picks
            them up immediately — no redeploy, no editing environment variables by hand.
          </p>
        </div>
        <VaultManager />
      </section>

      {/* Sign in with Google */}
      <section className="mt-10 rounded-2xl border border-olive-100 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-olive-950">Sign in with Google</h2>
            <p className="mt-1 text-sm text-olive-600">
              {user
                ? "You're signed in with a database-free session cookie."
                : authReady
                  ? "OAuth is configured — try the flow end to end."
                  : "Add the OAuth credentials below to enable login."}
            </p>
          </div>
          {user ? (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium text-olive-900">{user.name ?? user.email}</p>
                <p className="text-xs text-olive-600">{user.email}</p>
              </div>
              <form action="/api/auth/google/logout" method="post">
                <button className="inline-flex items-center gap-1.5 rounded-lg border border-olive-200 bg-white px-3 py-2 text-sm font-medium text-olive-700 hover:bg-olive-50">
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </form>
            </div>
          ) : (
            <div className="flex gap-2">
              <a
                href="/api/auth/google/start?next=/developers"
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                  authReady
                    ? "bg-olive-800 text-white hover:bg-olive-900"
                    : "pointer-events-none bg-olive-100 text-olive-400"
                }`}
              >
                Connect Google
              </a>
            </div>
          )}
        </div>
      </section>

      {/* Integration cards */}
      <section className="mt-8 grid gap-5 lg:grid-cols-3">
        {integrations.map((it) => {
          const Icon = ICONS[it.id] ?? KeyRound;
          const badge = STATUS[it.status];
          return (
            <div key={it.id} className="flex flex-col rounded-2xl border border-olive-100 bg-white p-6">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-olive-50 text-olive-700">
                  <Icon className="h-5 w-5" />
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>
              <h3 className="mt-4 text-base font-semibold text-olive-950">{it.name}</h3>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-olive-600">{it.blurb}</p>

              <details className="mt-4 rounded-lg border border-olive-100 bg-olive-50/40 p-3">
                <summary className="cursor-pointer text-sm font-medium text-olive-800">
                  Setup ({it.env.length} env {it.env.length === 1 ? "var" : "vars"})
                </summary>
                <div className="mt-3 space-y-3">
                  <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-olive-700">
                    {it.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                  <div className="space-y-1.5">
                    {it.env.map((e) => (
                      <div key={e.name} className="text-xs">
                        <code className="rounded bg-olive-100 px-1.5 py-0.5 font-medium text-olive-900">
                          {e.name}
                        </code>
                        {e.public ? (
                          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-olive-500">
                            public
                          </span>
                        ) : null}
                        <p className="mt-0.5 text-olive-600">{e.note}</p>
                      </div>
                    ))}
                  </div>
                  {it.scopes ? (
                    <p className="text-xs text-olive-600">
                      Scopes: <span className="text-olive-800">{it.scopes.join(", ")}</span>
                    </p>
                  ) : null}
                  <a
                    href={it.consoleUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-xs font-medium text-olive-700 underline underline-offset-4 hover:text-olive-900"
                  >
                    Open Google Cloud console →
                  </a>
                </div>
              </details>

              {it.id === "google-calendar" && authReady ? (
                <a
                  href="/api/auth/google/start?calendar=1&next=/developers"
                  className="mt-3 inline-block text-xs font-medium text-olive-700 underline underline-offset-4 hover:text-olive-900"
                >
                  Connect with Calendar scope →
                </a>
              ) : null}
            </div>
          );
        })}
      </section>

      {/* OAuth registration values */}
      <section className="mt-8 rounded-2xl border border-olive-100 bg-white p-6">
        <h2 className="text-lg font-semibold text-olive-950">Register these in Google Cloud</h2>
        <p className="mt-1 text-sm text-olive-600">
          Paste these exact values into your OAuth 2.0 Client. They&apos;re derived from{" "}
          <code className="rounded bg-olive-100 px-1 py-0.5 text-xs">NEXT_PUBLIC_SITE_URL</code>.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <CopyField label="Authorized JavaScript origin" value={base} />
          <CopyField label="Authorized redirect URI" value={googleRedirectUri()} />
        </div>
      </section>

      {/* Catalog API */}
      <section className="mt-8 rounded-2xl border border-olive-100 bg-white p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-olive-950">Catalog API</h2>
          <a
            href="/api/v1"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-olive-700 underline underline-offset-4 hover:text-olive-900"
          >
            /api/v1 reference →
          </a>
        </div>
        <p className="mt-1 text-sm text-olive-600">
          Read-only JSON over the live catalog (falls back to the seed catalog when the
          database is offline). CORS-enabled, so you can build a separate front end against it.
          Try a request:
        </p>
        <div className="mt-4">
          <ApiConsole />
        </div>
      </section>
    </Container>
  );
}
