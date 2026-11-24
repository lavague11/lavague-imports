# Two Pricing Models — Retail E-commerce vs Wholesale Quote

Status: **building** — §7 decisions recorded 2026-11-24. Stage 1 (schema + statuses) first; stages 3–4 pause for decisions §7.5 / §7.6.

**Scope of this plan:** the five tasks you listed — map both models, list the mix-ups/leaks, define the wholesale statuses, the admin quote screen, the customer approve screen, and the retail/wholesale price separation.

**Flagged up front (read §0.1 + §7):** real *retail* pay-at-checkout **does not exist today** — the storefront "cart" is a quote request that takes no money. Your retail model ("see prices, add to cart, pay at checkout") is therefore a **separate, large build** (payment gateway + order/payment models + checkout). It is **not** built in this plan; it has its own investigate-only spec: **[docs/retail-checkout.md](./retail-checkout.md)**. Everything below (the wholesale quote→approve→invoice flow and the price separation) is what this plan builds.

---

## 0. Where we are today (investigation)

### 0.1 Retail ("e-commerce") — quote-only, no payment
- **No payment gateway exists.** No Stripe/PayPal/Square/Braintree dependency, no `/checkout` route, no `PaymentIntent` — repo-wide grep is empty.
- The storefront cart is a **client-side localStorage list** (`lvq-cart-v1`, `src/components/cart/cart-provider.tsx:11`) that submits a **`QuoteRequest`**, not an order:
  - Cart page = "Review your cart & request a quote" (`src/app/cart/page.tsx:17,28`); button says **"Send quote request"** (`src/components/cart/quote-view.tsx:261-262`).
  - Explicit copy to the shopper: "nothing is charged from this page" / "No payment is taken online" (`quote-view.tsx:146-149,247-249`, `add-to-quote.tsx:163`).
  - Server action only creates the lead: `src/app/actions/quote.ts:34,110` → `prisma.quoteRequest.create` + emails sales. Model `QuoteRequest` (`prisma/schema.prisma:225`), whose own comment says "the storefront cart submits one of these instead of a payment" (`:209`).
- The only payment code in the repo is **admin-side manual** recording of offline check/cash/ACH against invoices (`CustomerPayment`, `prisma/schema.prisma:1430`, comment: "an online card gateway (Stripe) is a separate, credentialed integration" — i.e. not built).
- **Prices shown:** every storefront surface renders the **retail** price via `formatPriceOrRequest(retailPriceCents)` (null → "Price on request"):
  - Product card `src/components/catalog/product-card.tsx:64-67` (+ struck `compareAtPriceCents` `:68-71`); /shop `src/app/shop/page.tsx:256-258`; homepage `src/app/page.tsx:93-95`; product detail `src/app/shop/[slug]/page.tsx:128-134` → `add-to-quote.tsx:97-111`; cart lines `quote-view.tsx:91-95`; search typeahead `search-box.tsx:187-193` (via `api-response.ts:47`).
  - Price helper: `src/lib/utils.ts:14` `formatPrice`, `:21` `formatPriceOrRequest`; lowest variant `src/lib/catalog/types.ts:78-84`; `minPriceCents` denormalized for sort (`prisma/schema.prisma:48-50`).

### 0.2 Wholesale — price-free ordering works; quote/approve is only half-built
- The **customer-facing** wholesale flow uses the lightweight `Customer → OrderRequest → CustomerInvoice` models (NOT the heavy CRM below).
- **Ordering is correctly price-free** (this is already how you want it): the line sheet, cart, and request page show pack sizes and cases, **no prices** (`src/app/wholesale/order/page.tsx`, `/wholesale/cart`, submit `src/app/wholesale/cart/submit/route.ts`). Submitting creates an `OrderRequest` (status `SUBMITTED`) in cases. Nothing is charged. ✅
- **Admin handling is read-only + one button.** `src/app/admin/orders/[id]/page.tsx` shows the request (no price fields); its only action is **"Create invoice"** (`:122-126`), which POSTs to `src/app/admin/orders/[id]/invoice/route.ts`:
  - seeds a **DRAFT `CustomerInvoice`**, one line per item (qty = cases, **price 0** "to be quoted"), links `orderRequestId`, sets the request to **`QUOTED`** (`:54`), and redirects to the invoice editor.
- **Admin prices in the invoice editor**, not on the order: `src/app/admin/invoices/[id]/page.tsx` (edit lines/discount/shipping/tax), Save (`.../save/route.ts`), **Send** (`.../send/route.ts:39-45` mints `publicToken`, `DRAFT→SENT`, emails the `/invoice/{token}` link).
- **Customer "approval" is e-signing the invoice**, not approving a quote: public view `src/app/invoice/[token]/page.tsx:139-158` → "Accept this invoice" → `.../sign/route.ts:33-36` sets `signedAt/signerName/signatureData`.
- **Customer never sees a quote before the invoice**, and there is **no customer order-detail page** — `src/app/account/orders/` has only the list `page.tsx` (status pill + cases, no prices, no actions) and a `reorder` route. No approve/request-changes anywhere.

### 0.3 Where the two models are mixed up / where price leaks (the list you asked for)
1. **Wholesale account sees RETAIL prices on the storefront.** Storefront prices are **never gated on role** — a logged-in approved WHOLESALE customer browsing /shop, product detail, search, or cart sees the same retail prices as anyone. Leak points: `product-card.tsx:64-67`, `add-to-quote.tsx:104`, `shop/[slug]/page.tsx:128-134`, `search-box.tsx:187-193`, `quote-view.tsx:91-95`. (The header is the *only* storefront component that reads the session — `header.tsx:25` — and it only changes nav links, not prices; pages stay session-free to keep the CDN cache.) **→ decision in §5/§7.**
2. **"Retail checkout" is actually a quote request** (§0.1). The retail model you describe (pay at checkout) isn't implemented. **→ §7.**
3. **Dead wholesale statuses.** `OrderRequest.APPROVED / DECLINED / CANCELLED` and `adminNote` have badge/display support but **no code writes them** — only `QUOTED` is ever set (`orders/[id]/invoice/route.ts:54`). So there's no decline, no cancel, no approval on the order.
4. **Quote and invoice are collapsed.** The customer's only approval is e-signing the *invoice*; there is no distinct "quote the customer reviews and approves" step before the invoice exists — the opposite of your steps 3→4→5.
5. **Two parallel, overlapping wholesale designs.** The live one (`OrderRequest → CustomerInvoice`) and a **dormant** richer one (`BusinessAccount → PricingTier/AccountProductPrice → Quote/QuoteLine/QuoteAcceptance → WholesaleOrder`, `prisma/schema.prisma:634,739,766,870`) that has **zero runtime usage** (schema + generated client only). Naming collision too: CRM **`Quote`** vs the retail lead **`QuoteRequest`**. **This plan builds on the live customer-world models and leaves the CRM scaffolding dormant/out of scope** (see §7 for whether to delete it).

### 0.4 Pricing fields that already exist
- Retail: `ProductVariant.retailPriceCents`, `compareAtPriceCents` (`prisma/schema.prisma:191,193`); `Product.minPriceCents` (denormalized, `:50`).
- Wholesale: `Product.wholesalePriceCents` (`:84`), `ProductVariant.casePriceCents` (`:195`), per-account `AccountProductPrice.priceCents` (`:739`, but tied to the dormant `BusinessAccount`). **None of these are shown to any customer today.** ✅ (So your rule "wholesale prices never shown to retail" already holds — the gap is the *reverse*, #1 above.)

---

## 1. Target: two clean, separate models

| | Retail (e-commerce) | Wholesale (approved accounts) |
|---|---|---|
| Who | Anyone | `Customer.role === "WHOLESALE"` |
| Prices on storefront | Yes (retail) | *(decision §5: hide or keep)* |
| Flow | Add to cart → **pay at checkout** *(not built — §7)* | Add **cases** → submit request (no prices) |
| Approval | Payment | Customer approves the **quote** in-account |
| Outcome | Paid order | Quote → approved → **invoice** |
| Price source | `retailPriceCents` | admin-entered quote (prefilled from `wholesalePriceCents`/`casePriceCents`) |

This plan makes the **wholesale** column real end-to-end and enforces the price separation. The retail "pay at checkout" cell is the §7 decision.

---

## 2. Wholesale order statuses (state machine)

Extend `enum OrderRequestStatus` — **add `CHANGES_REQUESTED` and `INVOICED`**; keep the rest:

```
SUBMITTED        customer submitted cases, no prices yet
  → QUOTED       admin entered per-line prices and sent the quote
QUOTED
  → APPROVED            customer approved the quote
  → CHANGES_REQUESTED   customer asked for changes (+ their note) → back to admin
CHANGES_REQUESTED
  → QUOTED       admin re-priced and re-sent
APPROVED
  → INVOICED     admin (or auto) generates the CustomerInvoice from the approved quote
Any of SUBMITTED/QUOTED/CHANGES_REQUESTED
  → DECLINED     admin declines (keep existing enum value, give it a writer)
  → CANCELLED    customer or admin cancels (keep existing value, give it a writer)
```

- `DECLINED`/`CANCELLED` already exist — this just adds the actions that write them.
- `INVOICED` is terminal for the request; the **invoice** then runs its own lifecycle (DRAFT→SENT→signed→paid) exactly as today, reusing `/invoice/[token]` e-sign + PDF.

---

## 3. Admin screen — enter prices per line & send the quote

Turn the read-only `src/app/admin/orders/[id]/page.tsx` into an **editable quote**:
- Per-line **price input** (`quotedUnitPriceCents`), line totals, plus optional **discount / shipping / tax** and an admin note — same shape as the invoice editor so it feels familiar.
- **Prefill** each line's price from (in order): a per-account price → the variant `casePriceCents` → `wholesalePriceCents` → blank. Admin can override any line.
- Actions: **Send quote** (`SUBMITTED`/`CHANGES_REQUESTED` → `QUOTED`, stamp `quoteSentAt`, email the customer "your quote is ready" linking to their account), **Decline** (`→ DECLINED` + note), **Cancel**.
- The old "Create invoice" button moves to the **post-approval** step (§4): once `APPROVED`, a **"Generate invoice"** action copies the approved quoted prices into a `CustomerInvoice` (reusing `orders/[id]/invoice/route.ts`, but with real prices instead of 0) and sets `INVOICED`.

Proposed data (all additive):
```prisma
// OrderRequestLine
quotedUnitPriceCents Int?      // admin's per-line quote
quotedLineTotalCents Int?

// OrderRequest
quoteSubtotalCents Int?        // + discount/shipping/tax/total, mirroring CustomerInvoice
quoteDiscountCents Int?
quoteShippingCents Int?
quoteTaxCents      Int?
quoteTotalCents    Int?
quoteSentAt        DateTime?
approvedAt         DateTime?
customerChangeNote String?     // what the customer asked to change
// adminNote already exists (give it a writer)
```

## 4. Customer screen — review & approve the quote

New page `src/app/account/orders/[id]/page.tsx` (authenticated — no public token needed, the customer is logged in):
- **SUBMITTED** → "We're preparing your quote."
- **QUOTED** → the quoted lines **with prices + totals**, and two actions:
  - **Approve** → `APPROVED` (+ `approvedAt`); then an invoice is generated and the page shows "Approved — invoice to follow / here it is."
  - **Request changes** → textarea → `CHANGES_REQUESTED` (+ `customerChangeNote`), notify admin.
- **CHANGES_REQUESTED** → "Changes sent — we'll re-quote." **APPROVED** → link to the invoice once `INVOICED`.
- Full-page POST route handlers with relative 303s (Hostinger-safe), one per action: `/account/orders/[id]/approve`, `/request-changes`. Gated to the **owning** wholesale customer.
- The account order **list** (`account/orders/page.tsx`) gets a status pill linking into this page.

Flow end to end: **Submitted → (admin prices & sends) Quoted → (customer) Approved → (generate) Invoiced**, with **Changes requested** looping Quoted↔admin.

## 5. Product pricing: both models on one product, no leaks

- A product stays **one catalog row** with `retailEnabled` / `wholesaleEnabled` flags (already exist) and **separate prices**: `retailPriceCents` (retail) and `wholesalePriceCents`/`casePriceCents` (wholesale quote defaults). Admin pricing UI to set both (extend the existing pricing tool).
- **Wholesale prices are never shown to any customer** — they only prefill the admin quote (§3). This already holds; the plan keeps it.
- **The reverse leak (#1) needs your call (§7):** should a logged-in wholesale account still see **retail** prices while browsing the public shop?
  - **Option A (recommended, low-risk):** leave the storefront retail-priced for everyone. A wholesale account browsing /shop is simply shopping retail; their wholesale ordering stays in the price-free `/wholesale` portal. No storefront change, CDN cache preserved.
  - **Option B:** hide prices / swap to "request a quote" for wholesale-logged-in users on the storefront. This forces the shop pages to read the session per-request, **losing static caching** (the CDN-staleness risk we fixed before). More work, more risk.

## 6. Build stages (one deploy each, back up DB before the migration)
1. **Schema + statuses** — add `CHANGES_REQUESTED`/`INVOICED`, the quote price fields (§2–3). Migration only; no behavior change.
2. **Admin quote screen** (§3) — price entry + Send quote + Decline/Cancel; prefill from wholesale prices.
3. **Customer approve screen** (§4) — review, Approve, Request changes.
4. **Approved → invoice** — generate `CustomerInvoice` from approved quote, set `INVOICED`; reuse existing send/e-sign/PDF.
5. **Price separation / leak decision** (§5) — admin dual-price UI; Option A or B per §7.
6. **Retail checkout** — moved to its own investigate-only spec, [docs/retail-checkout.md](./retail-checkout.md). Not built here.

---

## 7. Decisions

### Decided (recorded 2026-11-24)
1. **Retail checkout (payment):** YES eventually, but **NOT in this plan** — investigated separately in **[docs/retail-checkout.md](./retail-checkout.md)** (investigate-only; Stripe account + keys stay with the owner). This plan builds the wholesale flow + price separation only.
2. **Wholesale accounts on the storefront:** **Option A** — retail prices stay visible to a logged-in wholesale account browsing the public shop. No storefront change; CDN cache preserved.
3. **Quote lives on the `OrderRequest`** (not the invoice), so "Quoted" and "Invoiced" are distinct states. Add **`CHANGES_REQUESTED`** and **`INVOICED`** to the status enum.
4. **Dormant CRM models** (`BusinessAccount`/`Quote`/`WholesaleOrder`): **leave in place, untouched.** Not used by this build.

### Decided (recorded 2026-11-24)
5. **Who turns an approved quote into the invoice** (stage 4): **admin clicks "Generate invoice"** after the customer approves — **no auto-invoice.** A person eyeballs the final numbers before an invoice goes out.
6. **Quote approval** (stage 3): a **plain "Approve" button** — record **who** (the signed-in customer) and **when** (`approvedAt`). The binding **e-signature stays on the invoice only** (`/invoice/[token]`). The quote-approval is the go-ahead to raise the invoice; the invoice is the document that's actually signed.
