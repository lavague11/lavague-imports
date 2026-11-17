# Fix report — `lavague-accounts-fixes.md`

Branch: **`accounts-fixes`** (pushed). Not deployed to production — a deploy waits until
the verifier checklist passes end to end. Mobile-first throughout.

This is a multi-week program. This report tracks every section A–Q honestly: what's **done
and verified**, what's **partial**, what's **blocked on a credential/decision**, and what's
**not started**. Nothing below is marked done unless it was verified in the running app.

## Status at a glance

| Sec | Title | Status |
|-----|-------|--------|
| A | DB connection / `?error=db` | ✅ Done (cause fixed; clearer message shipped) |
| — | Durable DB → Supabase | ✅ Done & verified (9,106 rows migrated) |
| B | One `/login` for everyone (email/pw + create + forgot) | ✅ Done & verified (Google pending OAuth creds) |
| C | Password reset, 30-min one-time links | 🟡 Built & verified; email send 🔒 blocked (SMTP) |
| D | Server-enforced roles Customer/Wholesale/Admin | ✅ Core done (admin + customer roles, server gates, approval promotes to WHOLESALE) |
| E | Wholesale application flow | ✅ Done & verified (apply→link→admin approve/decline→role flip + status) |
| F | Google Places business autocomplete | 🔒 Blocked (Places API key) |
| G | $500 wholesale minimum as order request | ⛔ Not started (needs L) |
| H | One admin bar (hide store header on /admin) | ✅ Done & verified (nav finalized: Dashboard·Products·Orders·Customers·More) |
| I | Customers page (replace "In progress") | 🟡 List + retail/wholesale toggle + search + CSV import done; detail/edit pending |
| J | Sample data script | ⛔ Not started (needs CRM tables) |
| K | Remove demo admin admin@lavagueimports.com | ✅ Done & verified |
| L | Wholesale ordering, no prices shown, reorder | ⛔ Not started (needs B/D) |
| M | Invoicing: PDF, e-sign, payments, delivery, reports, LV-#### | ⛔ Not started (largest; needs CRM tables + durable DB) |
| N | Auto-capitalize names on all forms | ✅ Done & verified |
| O | Wholesale customer portal | ⛔ Not started (needs B/D) |
| P | Restock tool | ⛔ Not started (needs CRM tables) |
| Q | Products list redesign | ✅ Done & verified |

## Done this run (committed + verified in the app)

- **A — DB / `?error=db`.** Root cause was Prisma schema drift, not an unreachable DB:
  the client expected columns migrations never added (`Product.retailEnabled` + 8 more,
  `AdminUser.capabilities/title`, enum `AdminRole.AE`). Fixed with additive `ALTER TABLE …
  ADD COLUMN IF NOT EXISTS`. Admin sign-in now works; storefront reads the DB instead of the
  JSON fallback. The vague "is the database connected?" message is replaced with a specific,
  actionable one that points at the DB-free Google path. (`docs/decisions.md`)
- **H — one admin bar.** New `StorefrontChrome` client wrapper renders the store header/
  footer on every route except `/admin/*`. Verified: `/admin` shows only the admin nav; `/`
  still shows the full store header.
- **K — demo admin removed.** `admin@lavagueimports.com` deleted (user + session).
  Remaining admins: `aelzoghabi@gmail.com`, `sales@lavagueimport.com`. No code referenced it.
  Idempotent script at `scripts/remove-demo-admin.mjs`.
- **N — name capitalization.** `titleCaseName` + `capitalizeNameOnBlur`, wired into the
  wholesale (business + contact name), contact, cart/quote (name + company), and admin
  new-user forms. Gentle: keeps acronyms and possessives, skips product names. Verified
  "joe's corner deli" → "Joe's Corner Deli".
- **Q — products list.** Inline Status dropdown (replaces the toggle), "Showing X of Y"
  removed (total moved quietly to the footer), header normalized to one 40px toolbar row.

## Section B — customer accounts (DONE & verified this run)

The keystone is in. Built on the new Supabase DB:

- **Model + migration.** `Customer` (email, nullable passwordHash, name, role
  CUSTOMER|WHOLESALE, googleSub, emailVerified) + `CustomerSession` +
  `PasswordResetToken`. Additive, idempotent migration (`scripts/migrations/001_…sql`),
  Prisma client regenerated.
- **Auth lib** `src/lib/customer-auth.ts` — scrypt-hashed passwords (reused from admin
  auth), 30-day httpOnly sessions, `getCustomer()` / `requireCustomer()` /
  `requireWholesale()` role gates.
- **Unified `/login`** — one page for everyone: email/password sign-in, create-account
  mode, forgot-password link, Google button (renders only when OAuth is configured).
  `/login/submit` routes an admin email to `/admin` and a customer to their `next`.
  Full-page POST → 303 (the Hostinger-safe pattern), never a Server Action.
- **`/signup/submit`**, **`/account`** (role-aware landing), **`/logout`**.
- **Password reset** (`/forgot` + `/reset`) — single-use, 30-minute tokens, no account
  enumeration. Email send uses the existing mail lib; **until sales@ SMTP creds land it
  logs the reset link server-side** instead of sending (see `docs/blocked.md`).
- Header "Sign in" now points at `/login` (desktop + mobile).

**Verified in the running app:** signup creates the customer (name auto-capitalized
server-side) and session → `/account`; logout clears it and `/account` is gated; sign-in
works; reset issues a valid token, the reset page accepts it, the new password works and
the old one is rejected, and the token is consumed. Test customer removed afterward.

### What still needs B's neighbors
- **Google on `/login`** — button is wired but hidden until `GOOGLE_CLIENT_ID/SECRET` land
  and a customer OAuth callback is added (admin Google path already exists). (blocked)

## Section E — wholesale application (DONE & verified this run)

- Application now links to the signed-in `Customer` (`WholesaleApplication.customerId`,
  additive migration `002`); the wholesale form attaches it automatically.
- **Admin Applications list** at `/admin/wholesale` (replaces the placeholder): tabs
  Pending/Approved/Declined/All with a pending count badge, full applicant details, and
  **Approve / Decline with an optional note** — server-enforced (`requireAdmin`).
- **Approve** sets the application APPROVED, **flips the linked customer to `WHOLESALE`**,
  records who/when, and emails the applicant (logged until SMTP lands). **Decline** records
  the note and emails. This completes **D**: role promotion is server-side.
- `/account` shows the application state: *pending review* card, or *re-apply* after a
  decline, or the wholesale-order card once approved.
- **H nav finalized** alongside: core bar is Dashboard · Products · Orders · Customers ·
  More; the Wholesale tab is gone (Applications moved under More); "Admin" text dropped.
- **Verified end-to-end:** seeded a customer + linked application → admin saw "has account"
  → clicked Approve → DB showed APPROVED + `reviewedBy` + customer role `WHOLESALE` → that
  customer's `/account` rendered the wholesale view (no "apply" card). Fixtures removed.

## Section I — Customers page (list + toggle + import; DONE this run)

- Replaced the "In progress" placeholder at `/admin/customers` with a real page:
  a **Retail ⇄ Wholesale ⇄ All toggle** (with live counts), search over business/name/
  email, a desktop table + mobile cards (verified at 375px), role badges (Customer /
  Wholesale / Blocked), and a "new applicants" badge linking to Applications.
- Extended `Customer` with `businessName`, `phone`, `address`, `notes`, `blocked`
  (additive migration `003`).
- **Imported 29 wholesale customers** from the user's CSV
  (`scripts/import-wholesale-customers.mjs`, idempotent upsert on email, "(UC)/Not found"
  address markers cleaned). All now show as role WHOLESALE. The CSV holds customer PII and
  is intentionally **not** committed to the repo.
- **Still to come for I:** customer detail page with edit (role/notes/block, addresses,
  pricing tier) + change audit log, and the applicant "Request more info" action.

## Blocked (in `docs/blocked.md`)

SMTP for `sales@` (C), Google OAuth client (B's Google button), Google Places key (F),
durable-Postgres decision before M, one-time Hostinger CDN purge.
