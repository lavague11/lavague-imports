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

## Infrastructure

- [ ] **Durable Postgres.** Memory note (`temp-database`) flags anonymous create-db
  instances failing; a Supabase MCP + Prisma Postgres MCP are now attached to this session.
  Decision needed: keep Neon (current `DATABASE_URL`) or migrate to a managed Supabase/
  Prisma Postgres project. Logged for a deliberate call before the invoicing module (M)
  lands, since it adds the heaviest write load.

- [ ] **Hostinger CDN purge** (carried over). One-time purge needed so the CDN stops
  serving year-cached HTML pointing at rotated `/_next` assets. Revalidate headers are in
  `next.config.ts`; the purge itself is a dashboard action.
