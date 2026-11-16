# Decisions — accounts-fixes run

Running log of non-obvious choices made while executing `lavague-accounts-fixes.md`.
Branch: `accounts-fixes`. Mobile-first (390 / 430 / 1440).

## 2026-11-16

- **Section A (DB / `?error=db`) root cause.** The sign-in `?error=db` was **not** an
  unreachable database — it was Prisma schema drift. The schema + generated client
  expected columns that migrations had never added (`Product.retailEnabled`,
  `wholesaleEnabled`, `wholesalePriceCents`, `msrpCents`, `moqUnits`, `casePack`,
  `supplier`, `stockUnits`, `leadTimeDays`; `AdminUser.capabilities`, `AdminUser.title`;
  enum `AdminRole.AE`). Every query that selected a missing column threw, the storefront
  silently fell back to `catalog.json`, and admin login returned `?error=db`. Fixed with
  additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (no data loss, no destructive ops).
  Follow-up in this run: replace the vague `?error=db` with a specific DB-down error page.

- **Section H (one admin bar).** The root layout rendered the storefront `<Header>` and
  `<Footer>` on every route, so `/admin/*` showed two bars (store header + admin nav).
  Rather than restructure the whole route tree into `(store)` / `(admin)` groups — a large,
  risky refactor touching every page — I added a small client `StorefrontChrome` wrapper
  that reads `usePathname()` and renders the store chrome only off `/admin`. Keeps the
  storefront header working everywhere else and leaves the admin layout's own `<main>`.

- **Scope reality.** `lavague-accounts-fixes.md` is a multi-week program (customer accounts,
  roles, wholesale application + ordering, invoicing + e-sign + payments, customer portal,
  restock, Places autocomplete, SMTP password reset). It cannot land in a single run. This
  branch advances it section by section with verified commits; `docs/fix-report.md` tracks
  per-section status. Credential-gated work is parked in `docs/blocked.md`, not faked.

- **No production deploy from this run.** Changes are committed to `accounts-fixes` only.
  A production deploy waits until the verifier checklist in the spec passes end to end.
