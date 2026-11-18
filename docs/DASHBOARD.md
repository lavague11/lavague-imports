# docs/DASHBOARD.md — La Vague Admin Dashboard

Save as `docs/DASHBOARD.md` in the La Vague repo. Build AFTER the Products UI spec is finished, never at the same time. One stage per deploy: backup, deploy to production, live check on desktop and phone, report with screenshots.

## Run mode: automated

- Build every stage in order (1 → 1b → 2 → 3) without waiting for approval between stages, as long as tests pass.
- Per stage: verified backup, automated tests, deploy to production, live check on desktop and phone, short report with screenshots, then go straight to the next stage.
- If anything fails: stop, roll back, fix, redeploy, then continue.
- Use the Claude in Chrome extension for any dashboard or browser step (never enter passwords, PINs or payments).
- Never run destructive database changes (deletes, merges, column drops) without Ahmed's explicit OK.

## Problem

The current dashboard is a catalog-cleanup console: Products 2485, Missing an image 235, Hidden 0, Custom 167, Manual edits 1584, plus two buttons and empty space. None of it shows how the business is doing.

## Goal

One dashboard page that leads with money and what needs attention. Wholesale first. Built so an E-Commerce view can be added later as a second view of the same page, not a second dashboard.

## Stage 1 — Wholesale dashboard (build now)

### Money row (top)

- Outstanding (open A/R), currently $32,344.50.
- Overdue, with the aging split (1–30, 31–60, 61+ days) on tap.
- Collected this month, with a small comparison to last month.
- Average order (last 90 days).
- Every card links to the matching filtered Invoices list.

### Needs you

- Overdue invoices, oldest first: customer, invoice number (I-number + LV), balance, days late, and a Call / Text / Remind action.
- New order requests waiting for a reply.
- Products marked "Needs review" (from photo or bulk add).
- Hidden when empty, never an empty box.

### Activity

- Recent invoices (last 10): customer, total, status chip.
- Recent payments (last 10): customer, amount, method.
- Newest customers.

### Catalog health (small strip at the bottom)

- One slim row: Missing image · Needs review · Custom · Edited by hand · Unpublished changes.
- Each count links to that Products filter.
- Demoted from headline cards to a single strip.

### Primary action

- "New invoice" button at the top right of the heading.

### Rules

- Numbers come from real data only, never placeholders or sample values.
- Credits and payments follow the existing invoice rules (isCredit, Paid/Partial/Open).
- Mobile: cards stack, money row first, "Needs you" second, nothing scrolls sideways.

## Stage 1b — Pro features (borrowed from Shopify, Square, QuickBooks; wholesale-relevant only)

Add these to the wholesale view, one per deploy, after Stage 1 is live.

### Date range + comparison

- Picker at the top: Today, 7 days, 30 days, This month, This year, Custom.
- Every money card shows the change vs the previous period (e.g. "+12% vs last month").

### Sales trend chart

- Revenue by week (or day/month by range), with last period as a faint line behind it.
- Tap a point to open that period's invoices.

### Top products

- Top 10 by revenue and by cases sold for the range, with thumbnail and trend arrow.

### Top customers + at-risk customers

- Top 10 customers by revenue for the range.
- "Haven't ordered lately": regular customers whose gap since last order is well past their usual ordering rhythm. One tap to call or text.

### Sales rep performance

- Revenue and invoice count per sales rep (Waleed and others) for the range.

### Collections

- A/R aging bar (current, 1–30, 31–60, 61+) and average days to get paid.
- Customers with the biggest balances first.

### Availability (no stock held)

- La Vague holds no inventory: products are bought from suppliers as orders come in. Do NOT build stock counts.
- Per product: Available / Limited / Unavailable, plus which supplier carries it and typical lead time.
- Unavailable items show "Currently unavailable" on the store and are flagged on invoices.
- Dashboard card: items marked Limited or Unavailable, so they can be re-checked with the supplier.

### Goals

- Optional monthly revenue goal with a progress bar.

### Quick actions + search

- Quick actions row: New invoice, Record payment, Add product, Add customer.
- Global search (Ctrl/⌘+K): customers, invoices (I-number or LV), products.

### Customize

- Hide or reorder dashboard cards; remembered per user.
- Export any card's data to CSV.

### E-commerce features (built in Stage 3, full set)

- Online store sessions, conversion rate, average cart value, live visitors.
- Abandoned carts: list of carts left without checkout. When a cart is abandoned, the system automatically sends a reminder (email/text) to the shopper after a set delay, with a link back to the cart. Items marked Unavailable are left out of the reminder.
- Online orders to fulfill: new, packing, shipped, with one-tap status changes.
- Marketing attribution: where online orders came from (Google, Instagram, direct).

## Stage 2 — Toggle-ready structure (build with Stage 1)

- Build the page as sections fed by a "view" setting, defaulting to Wholesale.
- Adding a second view later should only add new section content, with no rebuild of the page.
- Navigation stays the same in every view.

## Stage 3 — Wholesale / E-Commerce toggle (only when e-commerce has real orders)

- Ahmed wants the full e-commerce side built. Build it after Stages 1 and 1b are live, using the e-commerce features listed above.
- Design: compact pill toggle "Wholesale | E-Commerce" at the upper right of the Dashboard heading, same style as the IOT TECHS Customer/Internal toggle.
- Switching changes the money cards, the orders/activity sections and the primary action (New invoice ↔ Manage online orders). Navigation stays the same.
- Remember the last selection. Subtle fade/slide transition when switching.
- One page with two views, sharing customers, inventory and order records.
- It's a view selector, NOT a permission control. Access to financial data is enforced separately on the server.

## Later (plan the data model for these now, build after Stage 3)

- Profit and margin: product cost per size, margin per invoice, product and customer.
- Suppliers and purchase orders: reorder from a supplier, receive stock against a PO.
- Customer price lists: tier or per-customer prices that fill invoices automatically.
- Deliveries: route and date per order, driver view, proof of delivery.
- Reports page: sales, A/R, inventory and tax summaries, exportable.
- Phone push notifications for big events (large order, overdue, low stock).
- Each sale is a buy-from-supplier, sell-to-customer pair: track what was paid to the supplier per order, so profit = sale minus supplier cost.

## Acceptance — screenshots

Desktop and phone: the full Wholesale dashboard with real numbers, the "Needs you" list with an overdue invoice, the catalog-health strip linking to a Products filter, and the empty state (Needs you hidden when nothing is pending).
