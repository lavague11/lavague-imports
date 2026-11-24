# Retail Checkout (pay online) — investigation

Status: **investigate-only** — no build, no decision locked. Sibling to [docs/pricing-models.md](./pricing-models.md) (§7.1 sent retail checkout here). **Stripe account + API keys stay with the owner;** nothing in this doc assumes keys are in the repo or that any integration is wired.

Goal being investigated: let **retail** shoppers see prices, add to cart, and **pay online at checkout** like a normal store — separate from the wholesale quote flow.

---

## 0. Where we are today
- **No payment anywhere.** No Stripe/PayPal/Square dependency, no `/checkout` route, no `PaymentIntent` (repo-wide grep empty). The storefront is marketing + catalog + a **quote request**.
- **The "cart" is a client-side quote builder**, not an order:
  - localStorage list `lvq-cart-v1` (`src/components/cart/cart-provider.tsx:11`); cart page = "Review your cart & request a quote" (`src/app/cart/page.tsx:17`); button "Send quote request" (`src/components/cart/quote-view.tsx:261-262`); copy "No payment is taken online" (`add-to-quote.tsx:163`).
  - Submit → `submitQuoteRequest` (`src/app/actions/quote.ts:34`) → `prisma.quoteRequest.create` + emails sales. Model `QuoteRequest`/`QuoteItem` (`prisma/schema.prisma:225,253`) — a **lead**, no money, no fulfilment.
- **Prices exist and render** retail via `retailPriceCents` (`product-card.tsx:64-67`, etc.); price-less items show "Price on request".
- **The only payment concept** is **offline, admin-recorded**: `CustomerPayment` (`prisma/schema.prisma:1430`) against `CustomerInvoice` — manual check/cash/ACH. Its comment states an online card gateway "is a separate, credentialed integration" (not built). There is **no retail online-order model** (`OrderRequest` is wholesale; `WholesaleOrder` is the dormant CRM).

**So building retail checkout is net-new**, not a tweak: a payment integration + an online-order record + a checkout flow, sitting beside (not replacing) the existing quote path for price-on-request items.

## 1. What "real checkout" needs (scope)
1. **Payment integration (Stripe).** Recommend **Stripe-hosted Checkout** (redirect to Stripe's page) over embedded Elements — it keeps us **out of PCI scope** (card data never touches our server/host), handles 3-DS/wallets, and is the least code. Elements is only worth it if we need a fully on-site checkout look.
2. **An online-order data model** — new, retail-only, e.g. `RetailOrder` + `RetailOrderLine` + `OrderPayment`, with a status lifecycle (`PENDING_PAYMENT → PAID → FULFILLING → SHIPPED/DELIVERED → COMPLETED`, plus `CANCELLED`/`REFUNDED`). Snapshot price/name per line (like the other line models here). Keep it **distinct from** wholesale `OrderRequest`/`CustomerInvoice`.
3. **Checkout flow** — a `/checkout` route: collect delivery details → create the order `PENDING_PAYMENT` → create a Stripe Checkout Session → redirect → return to `/checkout/success` / `/checkout/cancel`.
4. **Stripe webhook** — a public route handler (e.g. `/api/stripe/webhook`) that verifies the signature and flips the order to `PAID` on `checkout.session.completed`. **Payment status must come from the webhook, never from the browser redirect** (the redirect is spoofable). Needs the webhook signing secret (owner-provided).
5. **Order confirmation + emails** — success page, receipt email, and the order showing under the customer's account.
6. **Admin order management** — list/detail of paid retail orders, mark fulfilled/shipped, issue refunds (Stripe refund API).
7. **Shipping / delivery / tax** — the site advertises NY & NJ delivery and "free shipping on online orders" (`header.tsx:43`). Decide: flat/free shipping vs. zones; whether to collect sales tax (Stripe Tax can automate) — both affect the order total math.
8. **Stock** — La Vague holds no stock (`Product.availability` is a sourcing status, `schema:97-99`). Decide whether online checkout is limited to in-stock/available items or allowed for all.

## 2. How it coexists with the current quote cart
- Items **with** a `retailPriceCents` → "Add to cart" → **Checkout & pay** (new).
- Items **without** a price ("Price on request") → keep today's **quote request** path.
- A cart could contain both; simplest rule: a cart with any price-less item routes to quote, a fully-priced cart can check out. (Decision below.)
- Wholesale is untouched: approved wholesale accounts still use the price-free `/wholesale` quote flow (per pricing-models.md Option A, they can also shop retail at retail prices).

## 3. Platform constraints to respect
- **Hostinger:** server-action redirects crash here — the checkout POST and webhook must be **route handlers** returning relative 303s / JSON (same pattern as login/logout). The Stripe webhook is an ordinary POST route handler.
- **Secrets:** `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` live in the host env (owner sets them), never in the repo. Test mode first (test keys + Stripe CLI/`4242…` card), then live.
- **Idempotency:** webhook handlers must be idempotent (Stripe retries); guard on the session/event id.

## 4. Open questions (for when we decide to build)
1. **Stripe-hosted Checkout (recommended) vs embedded Elements?**
2. **Guest checkout vs. account required?** (The site already has customer accounts.)
3. **Shipping & tax:** free-everywhere, NY/NJ zones, or Stripe Tax? What total does the customer actually pay?
4. **Mixed cart rule** (priced + price-on-request) — route whole cart to quote, or check out the priced part?
5. **Refunds/cancellations policy** and who can issue them in admin.
6. **Order numbering** and whether a paid retail order also produces a `CustomerInvoice` (for a unified "invoices" view) or stays its own `RetailOrder`.

## 5. Rough build shape (NOT scheduled — for sizing only)
1. Data model (`RetailOrder`/line/payment + status enum) — migration only.
2. Stripe Checkout Session + `/checkout` + success/cancel.
3. Webhook → `PAID`; order confirmation + receipt email; order under account.
4. Admin retail-orders screen (fulfil/ship/refund).
5. Shipping/tax rules; mixed-cart handling.

This is **materially larger** than the wholesale quote build, mostly because of payments, webhooks, refunds, and the money-handling testing that a live gateway demands. **Nothing here is built.** When you want it, confirm §4 and provide Stripe **test** keys to start.
