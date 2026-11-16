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
| B | One `/login` for everyone (Google + email/pw + create + forgot) | ⛔ Not started — keystone, see below |
| C | Password reset via sales@ SMTP, 30-min links | 🔒 Blocked (SMTP creds) |
| D | Server-enforced roles Customer/Wholesale/Admin | 🟡 Partial (admin roles enforced; customer roles need B) |
| E | Wholesale application flow | 🟡 Partial (public form exists; account creation needs B/D) |
| F | Google Places business autocomplete | 🔒 Blocked (Places API key) |
| G | $500 wholesale minimum as order request | ⛔ Not started (needs L) |
| H | One admin bar (hide store header on /admin) | ✅ Done & verified |
| I | Customers page (replace "In progress") | ⛔ Not started (needs B/D + CRM tables) |
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

## The keystone: Section B (one `/login` + customer accounts)

Almost everything not-yet-started depends on a **customer account system that does not exist
yet** — today the app has only admin auth (DB sessions + a Google-session cookie). B unblocks
D (customer roles), E (application → account), I (customers page), L (ordering), O (portal).

Recommended next run, in order:
1. **Customer model + migration** — `Customer` (email, passwordHash, role
   CUSTOMER|WHOLESALE, name, verified) + `CustomerSession`. Additive migration via a pg
   script (the pattern that worked for A/K).
2. **`/login`** — one page for everyone: email/password, create account, Google button,
   "forgot password" link. Reuse the admin login's POST-redirect pattern (works on Hostinger).
3. **Role gate** — `getCustomer()` + middleware; wholesale pages require role WHOLESALE.
4. Point the header "Sign in" at `/login`; admins get an "Admin" link in the account menu.

Then C (reset emails) and F (Places) drop in once their credentials land — see
`docs/blocked.md`.

## Blocked (in `docs/blocked.md`)

SMTP for `sales@` (C), Google OAuth client (B's Google button), Google Places key (F),
durable-Postgres decision before M, one-time Hostinger CDN purge.
