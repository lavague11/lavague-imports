# Blocked — needs a credential or an external decision

These items are built as far as code allows and then parked here. Each says exactly what's
needed to unblock. Nothing here is faked or stubbed as "done".

## Credentials

- [ ] **sales@lavagueimport.com SMTP** (Section C — password-reset + wholesale emails).
  Need host, port, username, and an app password for the `sales@` mailbox, set as
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (or stored in the encrypted key vault).
  Until then, reset/approval emails are generated and logged but not sent.

- [ ] **Google OAuth client** (Section B — "Continue with Google" on `/login`).
  Need `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` for an OAuth 2.0 Web client with
  `https://lavagueimport.com/api/auth/google/callback` (and the localhost equivalent) as
  authorized redirect URIs. The admin Google button already uses whatever is in the vault;
  this extends it to the customer login.

- [ ] **Google Places API key** (Section F — business-name autocomplete on the wholesale
  application). Need a key with Places API (New) enabled, restricted to the site's domains,
  as `GOOGLE_PLACES_API_KEY`. Field falls back to plain text input until then.

- [ ] **Online card payments — Stripe** (Section M, optional). Invoicing records manual
  payments (check / cash / ACH / wire / card-offline) today, which is the whole A/R loop.
  A "Pay now" card button on the customer invoice link needs a Stripe account:
  `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (and a webhook to mark the invoice paid).
  Everything else — PDF, send, e-sign, delivery, reports — works without it.

- [ ] **External e-signature — DocuSign/Dropbox Sign** (Section M, optional). Invoices use a
  built-in e-signature (typed name + drawn signature, captured on the customer link with a
  timestamp) — no external service needed. A legally-branded DocuSign flow, if ever wanted,
  would need that provider's API key; the in-app signature covers acceptance in the meantime.

## Infrastructure

- [x] **Durable Postgres — RESOLVED (2026-11-16).** Migrated to a durable Supabase project
  `lavague-imports` (ref `exkthnolisxqnnmyahbx`). Full schema applied, all 9,106 rows copied
  from Neon, counts verified. App runs on it locally. See `docs/decisions.md`. Remaining
  action is deploy-time only: set `DATABASE_URL` + `DATABASE_SSL_NO_VERIFY=true` on Hostinger.

- [ ] **Hostinger CDN purge** (carried over). One-time purge needed so the CDN stops
  serving year-cached HTML pointing at rotated `/_next` assets. Revalidate headers are in
  `next.config.ts`; the purge itself is a dashboard action.
