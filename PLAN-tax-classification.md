# Plan — Replace VAT with internal Taxable / Non-Taxable classification

## Goal
Madagama is **not VAT-registered**. Remove all VAT tax math, labels, and config. Replace with a
purely **internal** classification of each product as **Taxable** or **Non-Taxable**, and make every
invoice clearly belong to one of two "books" — mirroring their two physical bill books.

## Confirmed decisions
- **Mixed cart → auto-split** into two invoices on checkout (one Taxable bill, one Non-taxable bill).
- **Separate number series per book**: `TX-000001…` (taxable) and `NT-000001…` (non-taxable).
- No tax amounts anywhere — classification only. Prices are plain prices.

---

## 1. Data model (`prisma/schema.prisma`)
- `Product.isVatable` → **rename to `taxable`** (Boolean, default `true`).
- `Invoice`: **add** `taxCategory TaxCategory` (enum `TAXABLE | NON_TAXABLE`, default `TAXABLE`); **remove** `vatTotal`.
- `InvoiceItem`: **remove** `isVatable` and `vatAmount` (category is now per-invoice).
- `Setting`: **remove** `vatRate`, `vatInclusivePricing`, `tinVatNumber`. Keep business info, interest, SMS fields.
- New enum: `enum TaxCategory { TAXABLE NON_TAXABLE }`.
- Invoice totals semantics become: `subtotal` = sum of line totals; `grandTotal` = `subtotal − discount`; `amountPaid`/`discount` unchanged.

Migration: `prisma migrate dev --name tax_category`. Because dev data is all sample data, simplest is
`prisma migrate reset` then `db:seed` to get clean `TX-/NT-` numbering (old `INV-` rows otherwise remain, harmless).

## 2. Numbering (`src/lib/invoice-number.ts`)
`generateInvoiceNumber(tx, category)`:
- prefix = `category === "TAXABLE" ? "TX-" : "NT-"`
- next = count of invoices with that `taxCategory` + 1, zero-padded 6 → `TX-000001`.
- Keep the existing P2002 retry loop in callers.

## 3. Replace VAT lib (`src/lib/vat.ts` → delete; new `src/lib/totals.ts`)
```ts
export function sumLines(lines: {qty:number; unitPrice:number}[], discount=0) {
  const subtotal = round2(lines.reduce((s,l)=>s+l.qty*l.unitPrice,0));
  return { subtotal, discount: round2(discount), grandTotal: round2(Math.max(0, subtotal-discount)) };
}
```
No VAT split. Delete `src/lib/vat.ts`.

## 4. Billing logic
### Cash sale — `src/app/(app)/invoices/actions.ts` (`createCashInvoice`)
- Load products incl. `taxable`. **Group cart lines by `product.taxable`** → up to two groups.
- For each non-empty group create one invoice: `taxCategory`, its own `generateInvoiceNumber(tx, cat)`, items, decrement stock.
- **Discount split**: allocate the single discount **proportionally** by each group's subtotal (put rounding remainder on the larger group).
- Return type → `{ ok: true; invoices: {id; invoiceNumber; taxCategory; grandTotal}[] }`. Do both groups in **one `$transaction`** so the sale is atomic.

### Credit sale — `src/app/(app)/credit/actions.ts` (`createCreditSale`)
- A credit agreement is one-per-invoice, so **require all items to be the same category**. If items mix taxable + non-taxable → return error: "A credit sale must be all taxable or all non-taxable items — please make two separate credit sales." Set the invoice's `taxCategory` from the items. (Credit items are normally a single big item, so this is natural.)
- Remove VAT math; totals via `sumLines`.

## 5. UI
- **`src/app/api/products/search/route.ts`**: return `taxable` instead of `isVatable`.
- **`src/components/new-sale.tsx`**: drop `vatRate`/`inclusive`; use `sumLines`. Show a small breakdown — **Taxable items total / Non-taxable items total** — and a note "This will create 2 bills (TX + NT)" when both present. On success show a **result panel listing each created invoice** with View/Print links (handles 1 or 2 cleanly) instead of a single redirect.
- **`src/components/credit-sale.tsx`**: drop VAT display; show the derived category badge; inline warning if cart mixes categories.
- **`src/app/(app)/invoices/[id]/page.tsx`**: title `INVOICE` (not "TAX INVOICE"); prominent **`TAXABLE` / `NON-TAXABLE` badge/heading**; remove VAT line + TIN; show Subtotal / Discount / Total only.
- **`src/app/(app)/invoices/page.tsx`**: add a **Category column** (Taxable/Non-taxable badge) + optional `?category=` filter.
- **`src/app/(app)/products/page.tsx`**: replace `VAT/Exempt` badge with **`Taxable`/`Non-taxable`** from `taxable`.
- **`src/components/product-form.tsx`**: checkbox `Taxable item (internal)` bound to `taxable`.
- **`src/app/(app)/products/actions.ts`** + **`src/app/(app)/products/[id]/edit/page.tsx`**: `isVatable` → `taxable`.

## 6. Settings (`settings/actions.ts`, `settings/page.tsx`, `src/components/settings-form.tsx`)
Remove the VAT card (VAT rate, VAT-inclusive toggle, TIN). Keep business details, interest rate/grace, SMS.

## 7. Reports (`src/app/(app)/reports/page.tsx`)
Add a **"Sales by category (this month)"** mini-breakdown: Taxable total vs Non-taxable total (group invoices by `taxCategory`). COGS/profit logic unchanged.

## 8. Seed (`prisma/seed.ts`)
- Sample products `isVatable` → `taxable` (keep "TV Remote" as `taxable:false` for a non-taxable example).
- Remove `vatRate`/`vatInclusivePricing`/`tinVatNumber` from the `Setting` create.

---

## Files to modify
- `prisma/schema.prisma`, `prisma/seed.ts`
- `src/lib/invoice-number.ts`, **delete** `src/lib/vat.ts`, **add** `src/lib/totals.ts`
- `src/app/(app)/invoices/actions.ts`, `src/app/(app)/credit/actions.ts`
- `src/app/api/products/search/route.ts`
- `src/components/new-sale.tsx`, `src/components/credit-sale.tsx`, `src/components/product-form.tsx`
- `src/app/(app)/invoices/[id]/page.tsx`, `src/app/(app)/invoices/page.tsx`
- `src/app/(app)/products/page.tsx`, `src/app/(app)/products/actions.ts`, `src/app/(app)/products/[id]/edit/page.tsx`
- `src/app/(app)/settings/actions.ts`, `src/app/(app)/settings/page.tsx`, `src/components/settings-form.tsx`
- `src/app/(app)/reports/page.tsx`

## Verification
1. `prisma migrate dev --name tax_category` (or `migrate reset`) → `npm run db:seed`; `npm run build` (clean) + `npm run lint`.
2. Update `src/lib/vat.test.ts`? none exists — instead keep `credit.test.ts`/`product-code.test.ts` green: `npm test`.
3. Manual (run app, login):
   - Product form: mark one product Taxable, another Non-taxable; products list shows correct badges.
   - **Cash sale, taxable only** → one `TX-…` invoice; print shows "INVOICE" + TAXABLE badge, no VAT line.
   - **Cash sale, mixed cart** → completes into **two** invoices (`TX-…` + `NT-…`); result panel lists both; discount split proportionally; stock decremented for all items.
   - **Cash sale, non-taxable only** → one `NT-…` invoice.
   - **Credit sale mixed** → blocked with the clear error; single-category credit sale works and invoice carries the right category.
   - Invoices list filter by category works; Reports shows Taxable vs Non-taxable totals.
   - Settings no longer shows VAT/TIN fields.

## Notes
- Discount on a split sale is allocated proportionally by subtotal (documented; can switch to per-bill discount later if desired).
- Existing pre-migration sample invoices keep `INV-` numbers; a `migrate reset` + reseed gives fully consistent `TX-/NT-` numbering in dev.
