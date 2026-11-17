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
| G | $500 wholesale minimum as order request | ✅ Done with M — flagged in the invoice editor + on the invoice when a wholesale subtotal is under $500 |
| H | One admin bar (hide store header on /admin) | ✅ Done & verified (nav finalized: Dashboard·Products·Orders·Customers·More) |
| I | Customers page (replace "In progress") | ✅ Done & verified; detail redesigned as an overview (stats, invoices, orders, notes, edit drawer) |
| J | Sample data script | ⛔ Not started (needs CRM tables) |
| K | Remove demo admin admin@lavagueimports.com | ✅ Done & verified |
| L | Wholesale ordering, no prices shown, reorder | ✅ Core done & verified (line sheet, cart, submit, admin orders, usual items/reorder); Suggested-5 pending |
| M | Invoicing: PDF, e-sign, payments, delivery, reports, LV-#### | ✅ Core done & verified (create/convert, LV-####, editor, PDF, send + customer link, in-app e-sign, manual payments, delivery, reports); online card (Stripe) + external DocuSign optional/blocked |
| N | Auto-capitalize names on all forms | ✅ Done & verified |
| O | Wholesale customer portal | ✅ Done & verified (overview + stats, invoices, order history + reorder, profile) |
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
- **Imported the wholesale customers** from the user's CSVs. The initial 29 came via
  `scripts/import-wholesale-customers.mjs` (upsert on email). A later 63-row list is handled by
  the robust `scripts/import-wholesale-contacts.mjs`: it **dedupes by business name** (so the
  earlier rows update rather than duplicate and no two businesses collapse onto a shared email),
  adds **every** business (the email-keyed importer silently skipped no-email / shared-email
  rows), gives those a clearly-fake `…@contacts.invalid` placeholder with a note explaining why,
  and folds the `(UC)` "unconfirmed" marker into a note. Dry-run by default; `--apply` to write.
  Now **64 wholesale** (incl. the sample). `parse-addresses.mjs` structures the single-line
  addresses. The CSVs hold customer PII and are intentionally **not** committed to the repo.
- **Detail / edit screen (done):** `/admin/customers/[id]` — edit business, contact,
  email, phone, address, role, **block**, and internal notes (names auto-capitalized).
  Role/block changes ask for confirmation. Every save writes a **diff to `CustomerAudit`**
  ("who changed what", shown as Change history on the page). Email-uniqueness guarded.
  Also shows the customer's wholesale-application history. Verified: edited phone+notes →
  audit recorded `sales@…` with the before→after diff; real row restored afterward.
- **Deferred for I:** pricing-tier assignment and multiple saved addresses (depend on the
  pricing/CRM wiring in L/M), and the applicant "Request more info" action.

## Section L — wholesale ordering, no prices (DONE this run)

Architecture note: order requests are **Customer-based** (`OrderRequest` + `OrderRequestLine`,
migration `005`), not the heavy `BusinessAccount`/`WholesaleOrder` CRM — matching the
accounts system actually in use. Admin converts a request to an invoice in M.

- **No prices anywhere for wholesale.** New line sheet at `/wholesale/order` (gated to role
  WHOLESALE) shows photo, name, unit size and case pack only — never a price. Cookie-based
  order-request cart (`lv_wholesale_cart`, stores only `{slug: cases}`).
- **Flow:** add/update/remove cases → `/wholesale/cart` review (no prices) → submit creates
  an `OrderRequest` (status SUBMITTED, ref `WR-…`) + lines, clears the cart, emails sales
  (logged until SMTP), and shows a confirmation page.
- **Admin Orders** (`/admin/orders`, replaced the placeholder): tabbed list (Open/New/
  Quoted/All) with a "New" badge, and a detail page with the customer, note, and line items
  in cases. Server-enforced admin.
- **Your usual items / Reorder:** the line sheet shows products from past requests with the
  last-ordered quantities and per-item re-add, plus a **Reorder all** button.
- **Verified end-to-end:** signed in as a test wholesale account → line sheet renders with
  no prices (only React's internal `$` markers, not money) → added 2 items → cart showed
  them with no prices → submitted → `OrderRequest WR-… (2 lines, 5 cases, note)` created and
  appeared in admin Orders list + detail → usual items + Reorder all worked. Test data removed.
- **Deferred for L:** the **Suggested items (5)** block (regularly-ordered-but-missing →
  popular-in-their-categories → new arrivals); it also appears in the M invoice builder.
- **Section G** ($500 minimum as an order request) lands with **M**, since the minimum is
  evaluated when the request is quoted/invoiced — wholesale never sees cart prices.

## Customer overview redesign + address + invoice foundation (this run)

- **`/admin/customers/[id]` is now an overview**, not a form: header (with "Missing phone/
  contact/address" tags, address as a Google Maps link that needs no key), five stat cards
  (Total spent, Open balance, Invoices, Avg. order, Last order), an **Invoices** table
  (filterable, overdue highlighted, rows open the invoice), **Order requests**, and inline
  **Internal notes**. The edit form moved into an **Edit drawer** (with Change history).
  Missing-field tags also show in the Customers list rows.
- **Structured address** (migration 006): `street/unit/city/state/zip/lat/lng/placeId` on
  Customer; the 25 imported single-line addresses were parsed into them. The edit form uses a
  **Places-Autocomplete-ready** `AddressFields` component that reads
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — **with no key it's plain manual entry, no errors**;
  autocomplete (US) turns on automatically once the key is set. `.env.example` documents the
  exact Google Cloud setup (enable Maps JavaScript API + Places API, restrict by referrer).
- **CustomerInvoice/CustomerInvoiceLine** (migration 006) — the Customer-based invoice data
  model the overview reads from; `/admin/invoices/[id]` shows a read-only invoice. This is the
  foundation for **Section M** (PDF, e-sign, payments still to build). A removable sample
  customer with 4 invoices demos the populated state (`scripts/seed-sample-invoices.mjs`).

## Section M — invoicing (DONE & verified this run)

Built on the lightweight `CustomerInvoice` model (not the heavy BusinessAccount CRM), matching
the accounts system actually in use. Credential-free by design — the whole A/R loop works with
no external service; Stripe/DocuSign are optional add-ons (`docs/blocked.md`).

- **Data model** (migration `007`): payments (`CustomerPayment` + method enum), delivery fields,
  in-app e-sign fields, a `publicToken` for the customer link, `orderRequestId` lineage, and a
  `NumberSeries` counter that mints **LV-####** atomically (single `UPDATE … +1`, race-safe).
- **Create an invoice** two ways: pick a customer at `/admin/invoices/new`, or **convert a
  wholesale order request** straight from the Orders page (seeds one line per item with the
  cases as quantity, links it back, flips the request to QUOTED).
- **Editor** (`/admin/invoices/[id]/edit`): add/remove lines, live subtotal/total, discount/
  delivery/tax, terms (with **auto due-date** from "Net N"), PO, notes. **Section G**: a wholesale
  subtotal under **$500** shows a minimum warning here and on the invoice.
- **Send**: mints the customer link, stamps sent, flips DRAFT→SENT, and emails the customer
  (best-effort — if SMTP isn't set it still marks sent and shows a copyable link).
- **Customer link** (`/invoice/[token]`, no sign-in): branded invoice, **Download PDF**, pay-by-
  check/ACH remittance, and an **in-app e-signature** (typed name + drawn signature, timestamped).
  Verified: customer signed → admin sees "Accepted by … on …" with the signature image.
- **Payments**: record manual payments (check/cash/card/ACH/wire); paid total + status recompute
  from the authoritative payment rows inside a transaction. (Online card = Stripe, blocked.)
- **Delivery confirmation**: mark delivered with date, who received it, and a note; clearable.
- **PDF**: a real server-generated PDF via `pdf-lib` (brand header, bill-to, lines, totals,
  balance, signature line) — no external service. Served inline at `/admin/invoices/[id]/pdf`
  and `/invoice/[token]/pdf`. WinAnsi-sanitized so a stray glyph can't break it.
- **Reports** (`/admin/reports`): invoiced / collected / outstanding / overdue, **A/R aging**
  (current · 1–30 · 31–60 · 61+), top customers, and recent payments.
- **Verified end-to-end** on the sample customer: converted WR-SAMPLE1 → LV-0005 draft → priced
  it in the editor (live total $360, auto Net-30 due date, $500-minimum warning) → saved → sent
  (link generated) → opened the customer link → signed → recorded a $454 payment (status/balance
  updated) → marked delivered → PDF rendered (200, valid `%PDF`) → reports totals reconciled.
- **Deferred/optional (blocked):** online card payments (Stripe) and an external DocuSign-style
  signature — both are credentialed add-ons; the in-app signature + manual payments cover the
  workflow today. A removable sample customer with 4 paid/open/overdue/partial invoices demos it.

## Section O — wholesale customer portal (DONE & verified this run)

The signed-in customer's own view of everything M produces, in the storefront chrome (not the
admin). Gated by the existing `CustomerSession`; role-aware.

- **`/account` dashboard** — greeting + role badge, a tab bar (Overview · Invoices · Orders ·
  Profile), stat cards (open balance, open invoices, overdue count, orders placed), a "Place a
  wholesale order" CTA, and recent-invoices / recent-orders snapshots. Retail customers instead
  see the apply/pending/re-apply card (unchanged B/E behaviour).
- **`/account/invoices`** — their full invoice list (issued/due/total/balance/status, overdue
  highlighted). Each row opens the customer invoice view (`/invoice/[token]` from M) to download
  the PDF, see payment instructions, and accept/sign. Only **sent** invoices appear (those with a
  customer link), so drafts stay internal.
- **`/account/orders`** — order-request history with line items and status, a per-order
  **"Reorder these"** and a **"Reorder usual items"** button (both reuse the Section L cookie cart
  → `/wholesale/cart`). Wholesale-only (retail is redirected to the overview).
- **`/account/profile`** — business / contact / email / phone / address (Google Maps link) and
  member-since, with an email link to request changes (admin still owns edits + the audit log).
- **Verified end-to-end** signed in as the sample wholesale customer: dashboard showed open
  balance $1,285, 3 open / 1 overdue, and the recent lists; the Invoices tab listed all four with
  correct derived statuses; "Reorder these" added the order's item (5 cases) to the cart; the
  Profile tab rendered the address as a Maps link. Auth gating (redirect to `/login?next=…`) and
  the retail-vs-wholesale branches both exercised.

## Blocked (in `docs/blocked.md`)

SMTP for `sales@` (C), Google OAuth client (B's Google button), Google Places key (F),
optional Stripe online payments + external e-sign (M), one-time Hostinger CDN purge.
