# Product Tags + Smarter Voice Matching

Status: **spec** (branch `product-tags`, separate from `invoice-voice`). Build in stages; deploy each; **back up the DB before any data change**; dry-run before any backfill.

**Explicitly out of scope** (separate future spec — do NOT build here): packaging levels (unit/box/case hierarchy) and any pricing changes. Pack-size hints seen in names are *recorded as suggestions only* (Part 7) and never used for matching or pricing.

---

## 0. Where we are today (investigation)

- `Product`: `name`, `brand?`, `barcode?` (EAN/UPC digits), `origin?`, `categoryId`, `images[]`, `isCustom`, `needsReview`, `isActive`, `availability`. **No structured tags, no size/unit fields, no spoken-names/alias field.**
- `ProductVariant`: `sku`, `name` (the size label, e.g. "70 g"), `retailPriceCents?`, `unitsPerCase?`.
- `ProductOverride`: durable hand-edit layer (`draft`, `imported`, `importSuggests`) that survives re-import (`prisma/seed.ts` re-applies it). Hand-edited fields are protected.
- Aliases: a **hardcoded** `PRODUCT_ALIASES` map in `src/lib/invoice-aliases.ts` (Arabic/Darija/misspelling → English terms). `searchTermsFor()` expands a transcript into search terms.
- Matching: `src/lib/admin/voice-catalog.ts` (`searchCatalog`, `findCatalogDuplicates`), `src/lib/admin/customer-match.ts` (customer fuzzy), voice `match` route (Sonnet item extraction + candidate pre-filter + last-paid pricing).
- Duplicates: `findDuplicateGroups`/`mergeProducts` in `src/lib/admin/duplicates.ts`; `MergeLog`, `ProductDuplicateDismissal`.
- **`product_name_mapping.xlsx` is NOT in the repo.** Pass-1 backfill will use product names + the alias table; the xlsx is used only if the user supplies it (see Open Questions).

~2,485 products total; 167 custom; 0 needs-review.

---

## 1. Structured tags on every product

New data, additive. Tags live on a dedicated table so they're queryable for matching and survive re-import via the override layer.

```prisma
enum TagKind { BRAND TYPE SIZE VARIANT SPOKEN }

model ProductTag {
  id        String  @id @default(cuid())
  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  kind      TagKind
  value     String   // display, e.g. "Harissa", "70 g", "Al Maghribya", "هريسة"
  norm      String   // normalized match key (lowercased, Arabic-normalized; size → base unit)
  lang      String?  // SPOKEN only: en | ar | darija | misc
  // SIZE only: normalized magnitude in base unit (ml / g / piece)
  sizeAmount Float?
  sizeUnit   String? // "ml" | "g" | "piece"
  source     String  @default("manual") // manual | backfill-names | backfill-xlsx | backfill-alias | backfill-ai | learned
  createdAt  DateTime @default(now())
  @@index([productId])
  @@index([kind, norm])
  @@index([norm])
}

// FIXED controlled, admin-editable list for TYPE.
model ProductTypeOption {
  id       String @id @default(cuid())
  name     String @unique
  position Int    @default(0)
}
```

Rules:
- **At most one** BRAND, TYPE, SIZE, VARIANT per product; **multiple SPOKEN** (target 3–6). **8 tags total max** per product (structured + spoken combined). Enforced in the editor and the write layer.
- TYPE value must come from `ProductTypeOption` (admin manages the list on a settings page). Seed the list from the distinct, cleaned product "type" words we already have (olive oil, harissa, couscous, biscuits, …).
- **Tags never required to save** a product.
- **Size normalization** into `sizeAmount`/`sizeUnit`: 1 L → 1000 ml, 1 kg → 1000 g, cl→ml, oz→g (28.35), lb→g (453.6); plain count → `piece`. The display `value` keeps what the admin typed.
- UI: tags render as **editable chips** on the product edit form, grouped (Brand · Type · Size · Variant · Spoken names), each removable; a "+ add" per group; TYPE is a select from the controlled list.
- Writes go through the override layer so a re-import doesn't wipe hand-entered tags.

## 2. Tag-first matching for voice orders

Replace the current name-only candidate search with a ranked resolver. For each spoken item:

**Rank order (first strong hit wins):**
1. **This customer's purchase history** — items this customer has bought whose tags/name match the utterance (exact-ish → high confidence, and we know their usual qty/price).
2. **Tag match** — BRAND + TYPE + SIZE + VARIANT + SPOKEN `norm` match against the normalized utterance tokens. Score by how many structured facets agree; a brand+type+size agreement is a confident match.
3. **Fuzzy name** — existing name/bigram fuzzy (today's behavior) as a backstop.
4. **Fallback** — alias-table expansion, then nothing (→ Part 3/4).

Normalization (shared util, used for tags *and* utterances):
- **Size words → sizes**: kbir/كبير = large, sghir/صغير = small, kilo/كيلو = 1000 g, litre/لتر/نص لتر = 1000/500 ml, etc. (a size-word lexicon).
- **Arabic normalization**: أ إ آ ٱ → ا ; ة → ه ; ى → ي ; strip diacritics (harakat); **Arabizi digits** 3→ع, 7→ح, 9→ق (and keep the Latin form too).
- Keep the existing Latin transliteration + consonant-skeleton from `customer-match.ts`.

Behavior:
- **Quantities: plain numbers only** for now (no "box/case" parsing — that's the out-of-scope packaging spec). If no qty is spoken, **default to how this customer usually orders that item** (mode of their past line quantities for that product); else 1.
- **Vague utterance with no history** (e.g. "olive oil") → ask **"Which brand and size?"** instead of guessing.

## 3. Unsure match → picker

When the top match is low-confidence, or the top 2 are close:
- Show **top 3 as tappable cards**: photo, brand, size, and **the last price THIS customer paid** (fall back to catalog price).
- **Answer by tap or voice**: "the first one" / "the second one" / a brand or size word.
- Last two options: **"None of these → search"** (catalog search box) and **"Create new item"** (→ Part 4).

## 4. No match → offer to create

- Nothing reasonably close → **"I couldn't find that — should we create a new item?"**
- **Never auto-create.** On yes → a **prefilled quick-add**: the spoken name, **guessed tags as editable chips** (brand/type/size/variant inferred from the utterance), saved as **Draft** (`isActive=false`, `needsReview=true`) until the admin confirms. (Extends today's voice create-product flow with tag prefill + draft state.)

## 5. Duplicate guard on ALL new-item paths

Applies to **voice, manual (New product), photo, barcode, and bulk**. One shared `findSimilarProducts(candidate)` used everywhere.

- Compare by: **barcode**, **brand + type + size**, **fuzzy name**, and **spoken-name tags**.
- Similar found → **"Are you sure you don't mean this one?"** with the top matches.
  - **"Use this one"** → adopts the existing product **and adds the spoken name as a SPOKEN alias** (so it's learned).
  - **"No, create new"** → proceeds.
- **Exact barcode match → block creation and open the existing product.**
- **Bulk import** → collect possible duplicates into a **review list** (one screen), not a per-row prompt.

## 6. Learning from corrections

- When a picker choice or a correction resolves a spoken name to a product, **save the mapping** (spoken name → product) with an **Undo toast** (10 s).
- **Guard**: if that name already maps to a *different* product, **ask before overwriting**.
- **Log who taught it and when.** A non-admin's lesson goes to **Pending** until an admin approves; an admin's applies immediately.
- Admin page **"Learned names"**: view / edit / delete / approve, filter by Pending.
- **Customer aliases** (spoken customer name → customer) learned the same way, same table shape.

```prisma
enum LearnedStatus { PENDING APPROVED }
enum LearnedKind { PRODUCT CUSTOMER }

model LearnedName {
  id         String        @id @default(cuid())
  kind       LearnedKind
  spoken     String        // display
  norm       String        // normalized key
  targetId   String        // productId or customerId
  status     LearnedStatus @default(PENDING)
  taughtById String?       // AdminUser id, or null for system
  taughtAt   DateTime      @default(now())
  approvedById String?
  @@unique([kind, norm])    // one active mapping per name; overwrite is guarded
  @@index([status])
}
```
Approved PRODUCT learned names feed the matcher as high-priority SPOKEN aliases; approved CUSTOMER names feed `customer-match`.

## 7. One-time tag backfill (~2,500 products)

**Dry run first, always.** Proposed tags go to a **staging table**, never straight to products.

```prisma
model TagBackfillRun {
  id        String   @id @default(cuid())
  pass      String   // "names" | "ai"
  status    String   // dry-run | approved | applied | rolled-back
  createdAt DateTime @default(now())
  appliedAt DateTime?
  costCents Int      @default(0)
  note      String?
}
model TagBackfillStaging {
  id         String  @id @default(cuid())
  runId      String
  productId  String
  kind       TagKind
  value      String
  norm       String
  sizeAmount Float?
  sizeUnit   String?
  confidence Float   // 0..1
  source     String  // names | xlsx | alias | ai
}
```

- **Preview before apply**: counts per field + **50 random samples**; apply only on explicit approval.
- **Pass 1 (free)**: extract brand/type/size/variant + spoken names from the product **name**, the alias table, and `product_name_mapping.xlsx` *if supplied*.
- **Pass 2 (AI)**: fill **missing fields only** with **Claude Haiku via the Batch API** (existing Anthropic key), **confidence per product**, **hard cost cap $10** (stop + report if the estimate exceeds it).
- **Never change** name, price, or hand-edited fields (respect the override `imported`/locked set).
- **Low confidence → "Check tags" filter** on the Products page.
- **Flag likely duplicates** found during backfill (list only — never merge).
- **Pack-size hints** seen in names ("12x6", "10ct") → a separate `packSizeHints` suggestions field on Product; **recorded, not used**.
- **One-click rollback** of an entire run (delete tags whose `source` + run match; `TagBackfillRun.status = rolled-back`).

## 8. New products auto-fill tags

- **Photo, barcode, bulk add**: **Claude Haiku** auto-fills tags as **editable chips** (admin can edit before save). **Keep Sonnet for photo *identify*** (the vision step); Haiku only structures the resulting fields into tags.

## 9. Accuracy + speed test

- Build a **test set of 30 real past voice orders** (transcript → correct catalog items), from past invoices/transcripts.
- Run the matcher **before and after** each matching stage; **report match accuracy** (items correctly resolved / total) and **average time per item** (matching must stay fast).

---

## Build stages (one deploy each; pause for "go ahead with stage N")

1. **Schema + tag CRUD UI** — `ProductTag`, `ProductTypeOption`, editable chips on the edit form, admin-editable TYPE list, size normalization + 8-tag cap. *(schema migration → DB backup first.)*
2. **Tag-first voice matching** — ranked resolver (history → tag → fuzzy → fallback), size-word lexicon, Arabic/Arabizi normalization, default-to-usual-qty, vague-ask. Build the **accuracy harness (Part 9)** here to measure before/after.
3. **Unsure → picker** — top-3 cards (photo/brand/size/last price), tap or voice, "search"/"create".
4. **No match → create** — prefilled quick-add with guessed tag chips, saved as Draft.
5. **Duplicate guard everywhere** — shared `findSimilarProducts`, barcode block, "use this one" learns an alias, bulk review list.
6. **Learning + Learned-names admin page** — `LearnedName`, Undo, overwrite guard, pending/approve, customer aliases.
7. **Backfill** — staging + dry-run + preview/samples + Pass 1 (free) then Pass 2 (Haiku Batch, $10 cap), "Check tags" filter, duplicate flags, pack-size hints, rollback. *(DB backup first.)*
8. **New-product tag auto-fill** — Haiku on photo/barcode/bulk (Sonnet stays for identify).
9. **Accuracy report** — run the harness before/after, report accuracy + speed.

---

## Open questions (please confirm before stage 1 / stage 7)

1. **`product_name_mapping.xlsx`** isn't in the repo. Do you have it? If so, where — and should Pass 1 import it into the alias table / tags? (Pass 1 works without it, just with less coverage.)
2. **8-tag cap vs "3–6 spoken names"**: 4 structured + 6 spoken = 10. I'll cap at **8 total** (so e.g. 4 structured + up to 4 spoken, or fewer structured + more spoken). OK, or do you want 8 *spoken* on top of the 4 structured?
3. **TYPE controlled list seed**: seed it from the distinct cleaned type-words already in the catalog, for you to prune — OK?
4. **Backfill scope**: all ~2,485 products, or wholesale-enabled only first?
