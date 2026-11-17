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

- **Durable database → Supabase (resolved the `temp-database` blocker).** Created a free
  Supabase project `lavague-imports` (org `lavague11`, ref `exkthnolisxqnnmyahbx`, us-east-1).
  Applied the full Prisma schema (all 39 models, including the previously-unmigrated CRM
  tables) and migrated all 9,106 rows from Neon (Products, variants, categories, admin users
  + sessions, overrides, thumbs, etc.) with row counts verified equal on both sides.
  - The Supabase management role isn't a superuser (can't set the `postgres` password), so
    the app connects as a dedicated role **`lavague_app`** created with a known password,
    owning the `public` schema. Connection string lives only in the gitignored `.env`.
  - Node doesn't bundle Supabase's SSL chain, so `db.ts` honors `DATABASE_SSL_NO_VERIFY=true`
    (TLS stays on; chain verification is skipped). Set both `DATABASE_URL` and that flag.
  - **Prod deploy step:** set `DATABASE_URL` (Supabase) + `DATABASE_SSL_NO_VERIFY=true` in
    the Hostinger environment. The old Neon URL is kept commented in `.env` as a fallback.
  - Helper scripts committed: `supabase-run-sql.mjs`, `supabase-copy-data.mjs`,
    `table-counts.mjs` (all read secrets from env, none hardcoded).

- **Section M invoicing on the lightweight `CustomerInvoice` model, not the CRM `Invoice`.**
  The storefront accounts system is `Customer`-based (Sections B/E/I/L), so invoices hang off
  `Customer` (`CustomerInvoice` / `CustomerInvoiceLine` / `CustomerPayment`), matching order
  requests. The heavy `BusinessAccount → Invoice → Payment` CRM exists in the DB but isn't the
  system in use; wiring M into it would have split the customer record in two.
- **Invoicing is credential-free by design.** PDFs are generated server-side with `pdf-lib`
  (already a dependency), e-signature is in-app (typed name + canvas, timestamped on the public
  token link), and payments are recorded manually. Online card (Stripe) and external DocuSign
  are optional, parked in `docs/blocked.md`. This keeps the whole A/R loop working with no new
  secrets. `paidCents` is always the transactional sum of `CustomerPayment` rows; "Overdue" is
  derived from due date + balance, never stored. LV-#### is minted atomically via `NumberSeries`.
