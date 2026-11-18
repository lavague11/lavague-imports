# docs/PRODUCTS_UI.md — La Vague Admin: Products UI (minimal, Apple/Airbnb style)

Save this file as `docs/PRODUCTS_UI.md` in the La Vague repo, then build it section by section following **Section 18**.

## Goal
Simple, compact, consistent Products area. One form, one toolbar, photo-first adding. Reuse the existing photo-identify, catalog-first matching, alias table, and "Needs review" hidden products. Never build a second version of anything.

## Locked rules (apply everywhere)
- **Variant** = same brand, same product, same type — only the size (weight/volume) differs. A different SKU alone is NOT a variant. Different flavor or type = separate product.
- New products go live only after a successful create. Bulk/photo-created ones stay hidden + "Needs review" until approved.
- Edits stay private drafts until "Publish changes". Only Show/Hide updates immediately.
- Imports never overwrite hand-edited fields or custom products.
- Never auto-merge, never silently overwrite. Every merge/attach needs confirmation and can be undone.
- The store only shows published data.

## 1. List toolbar — one slim row (Small)
- Left: "Products" + one search field that filters as you type (remove the Search button).
- Right: Filter icon, "+ New", "…" menu with Export.
- Quick tabs (Missing image, No description, Hidden, Needs review, Custom, Unpublished changes, Possible duplicates) live in the Filter menu; active filters show as small removable chips only when on.
- Bulk bar only when rows are checked: "3 selected · Show · Hide · Set brand · Clear".
- "Price on request" stays as is.

## 2. "+ New" chooser (Small)
- "One item" or "Bulk (many photos)".

## 3. One form for New AND Edit (Medium)
- The New product layout becomes the single form for both. Same fields, order, photo behavior. Remove the old edit form.
- Photo-first: big drop zone ("Add or take photos") + "Scan barcode" at the top; AI fills the form.
- Photos as tiles (up to 3): tap/drag to add, drag to reorder, first = "Main", × to remove, "Enhance photo" per tile. No raw URL fields.
- Fields: Name, Category, Brand, Country, SKU, Unit size, Unit, Units per case, Price each, Ribbon, Description, Fragile.
- If the description mentions a case size (e.g. "case of 12") and Units per case is blank, suggest filling it.
- Edit header shows "View on store" and the source tag small.

## 4. Bulk add — eBay-style (Medium)
- Upload: one drop zone, any number of photos.
- Group: AI groups photos by product; drag between groups, split/merge; best-scoring photo = Main by default.
- Review: one screen of drafts, each run through catalog-first matching and Section 16 levels. New → prefilled, editable inline.
- Save all: new products saved hidden + "Needs review".
- Progress ("Identifying 6 of 10…"); one failed photo never blocks the rest.

## 5. Photo quality score (Small)
- 0–100, returned in the same AI call that identifies the product (no extra call).
- Checks: sharpness, lighting, fully in frame, label readable, background e-commerce ready.
- One small subtle-colored score chip per photo. Nothing else unless tapped. Tap → short breakdown + Enhance.
- Never blocks; any photo can be used.

## 6. Match confidence (Small)
- Tags based on what actually matched, not the AI's own guess:
  - **Strong match**: barcode or SKU AND the name/size from the photo agree.
  - **Possible match**: barcode alone, brand + name + size, or a known alias.
  - **Needs review**: photo guess only.
- Strong → one card "Yes, add it". Possible / Needs review → best guess + 3 alternatives.
- Bulk review: filter/sort by tag.

## 7. Options & case sizes (Small/Medium)
- Desktop: one compact table — Unit size · Unit · Units per case · Price — with "+ Add size".
- Blank case size or price shows a soft grey "—" / "On request". No zeros, no warnings.

## 8. Mobile (warehouse, phone)
- Product LIST on mobile = cards, never the desktop table. No sideways scrolling. Each card: thumbnail, name (max 2 lines), category, price (or "On request"), and a Visible/Hidden toggle. Tap the card opens the editor. Secondary actions (duplicate, delete) in a "…" menu on the card.
- Collapse the top controls: one search field, a single "Filter" button holding the chips, "+ New" as a floating button. Bulk-select behind a "Select" action, not always shown.
- Product FORM on mobile: sizes as stacked full-width cards, big tap targets, no tiny columns. Photo zone + Scan at top; sticky bottom action bar.
- Long-press a list card → quick sheet: Price, Show/Hide, Save. One step.
- Same responsive page as desktop — NOT a separate mobile build. Desktop keeps the full table (Sections 1, 7, 10).

## 9. Saving & publishing
- New: explicit "Create product". Switches to edit mode only after the server confirms the create; on failure stays "New product — not saved yet" with Retry, keeping all input.
- Edits autosave privately as a draft. Status always visible: "Saving…" → "Draft saved ✓" / "Offline — will retry". Never lose an edit; warn before leaving if unsaved.
- Store shows the last published version until "Publish changes" is pressed.
- "Unpublished changes" badge + prominent Publish button (desktop + phone); badge on list rows.
- Only Show/Hide is instant. Inline and quick-sheet price edits save as drafts.

## 10. Inline editing on the list (Small, desktop only)
- Price and Show/Hide editable in the row; Enter/blur saves (price as draft), 5-second Undo toast, no confirm dialogs. Admins only.
- Mobile uses the long-press quick sheet instead.

## 11. Brand as a real field (Medium)
- Fill from `product_name_mapping.xlsx` (brand column); rest blank, shown as "No brand". Never guess.
- Editable on the form with type-ahead; "Set brand" bulk action for selected rows.
- Brand filter on the list; "No brand" is a normal filter option.
- Back up the products table before filling.

## 12. Duplicate warning while typing (Small)
- Debounced (~400 ms), matching cleaned name + brand (+ size) via the alias table.
- Quiet line under Name: "Looks like [product] already exists — open it?" Never blocks. Uses Section 16 levels.

## 13. Naming rules (Small)
- Pattern: **Brand · Product · Size** (e.g. "Tayeb Pure Honey 1 kg").
- AI suggests the cleaned name on create/edit; never renames existing products without approval. Bulk "Suggest clean names" → review list → approve.

## 14. Store side
- Store shows the main photo, brand and case sizes from the **published** version only. Never draft data.

## 15. Imports vs manual edits (Medium)
- Any field changed by hand (name, price, brand, photos, description, case sizes) is marked "edited by hand" and locked against imports. Small lock icon; "Reset to imported value" per field.
- Re-imports only fill blank fields and update untouched ones. Never overwrite a hand-edited field or a draft.
- Different import value on a locked field → logged as "Import suggests: X"; I accept or ignore.
- Custom products (created in the admin) are never touched by imports.
- Import changes to live products follow the draft → Publish rule (Section 9).
- Re-import summary: "12 updated, 4 skipped (edited by hand)" with the list.

## 16. Duplicate & variant resolution (Medium)
- Levels when adding (form, bulk, photo, voice):
  - **Likely duplicate**: same brand + product + size → "Use existing" (default) · "Create new anyway".
  - **Related variant**: same brand + product, only size differs → "Add as a size of [product]" · "Create new".
  - **Possible match**: similar name, different or unknown brand → "Use [product]" · "Create new".
- Unclear data (e.g. "Hot" stored in a size field) → ask, default to separate product.
- Variant test: ONLY the unit size (weight/volume) differs → variant. Anything else differs (flavor, heat, type, packaging) → ask; default = separate product. A different SKU alone is NOT a variant.
- "Use existing" never changes the existing product. New photos, notes or a size attach only after I confirm each one, and can be undone.

## 17. Catalog cleanup — Possible duplicates (Medium)
- "Possible duplicates" filter groups existing products that look alike.
- Each group: side-by-side cards (photo, name, brand, size, price, invoices using it) with: **Merge into one** (pick which survives; invoices + photos move over), **Make sizes of one product** (only if the Section 16 variant rule holds), or **Not duplicates** (never ask again).
- Merges need confirmation, are logged, and can be undone. Back up the products table first.

## 18. Incremental deployment & testing (final)
- **One completed feature per deploy.** Start with Section 1 (toolbar + search), then follow dependencies: 2 → 3 → 7/8 → 10 → 11 → 12/13 → 4/5/6 → 9 → 14 → 15 → 16/17.
- Before each release: automated tests pass + a verified backup.
- Build without breaking existing pages, then deploy straight to production — no approval wait. Immediately do a live functionality check (desktop + phone screenshot).
- If anything fails: stop, roll back, fix, redeploy before continuing.
- No unrelated or destructive database changes (deletes, merges, renames, column drops) without my explicit OK.
- After each successful deploy, send a short report + screenshots so I can test it myself.
- Variant, draft/publish, import and duplicate rules stay exactly as written above.

## Acceptance — screenshots
Toolbar (nothing selected / 3 selected), New chooser, the form in New and Edit (honey product), a bulk run with ~6 photos of 2–3 products including one already in the catalog, score chips + match tags, case-size table desktop + phone cards, draft/publish badge flow, brand filter, duplicate warning, a duplicate group in cleanup, a re-import summary.
