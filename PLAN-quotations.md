# Feature: Customer Quotations

Formal price quotes to customers — **not** a sale. No stock movement, no invoice
number series. Mirrors the paper quotation book (Qty / Model / Product Details /
Price) while also letting you pull lines from the product catalog.

## Decisions (from the user)
- **Line items:** catalog **and** free-text. Search the catalog to prefill a line
  (model = product code, name, price) but every field stays editable, and blank
  free-text lines are allowed for spec'd items (e.g. solar pumps).
- **Persistence:** saved & tracked, numbered `QUO-000001` (count-based, mirror of
  `service-job-number.ts`). Quotations list + detail + edit.
- **Convert-to-sale:** deferred (follow-up).

## Schema (migration `20260701054615_add_quotations`, additive)
- `enum QuotationStatus { DRAFT SENT ACCEPTED DECLINED EXPIRED }`
- `Quotation` — `quotationNumber` unique, `status`, optional `customerId` **or**
  typed `customerName`/`address`/`phone`/`branch` (prospect / paper-style header),
  `subtotal`/`discount`/`grandTotal`, `notes`, `validUntil`, `soldByEmployeeId`,
  `createdByUserId`, timestamps.
- `QuotationItem` — optional `productId`, `model` (free text), `name` (req),
  `description` (multi-line), `qty`, `unitPrice`, `lineTotal`.
- Back-relations added to `User`/`Customer`/`Employee`/`Product`.

## Files
- `src/lib/quotation-number.ts` — `QUO-000001` generator (in-tx, P2002 retry).
- `src/app/(app)/quotations/actions.ts` — `createQuotation` / `updateQuotation`
  (shared `persist`, edit replaces lines wholesale), `setQuotationStatus`,
  `deleteQuotation` (redirects). All gated by `requireUser()`. Money via
  `sumLines` (totals.ts) — no new math.
- `src/components/quotation-form.tsx` — catalog search (reuses
  `/api/products/search`) + free-text lines; customer picker or typed header;
  discount / valid-until / prepared-by / notes; posts a typed object.
- `src/components/quotation-status-control.tsx` — status switcher + exported
  `quotationStatusLabel` / `quotationStatusTone`.
- `quotations/page.tsx` (list: search + status filter + 3 stat cards),
  `quotations/new`, `quotations/[id]` (A4 printable), `quotations/[id]/edit`,
  `quotations/loading.tsx`.
- Wiring: "Quotations" (FileText) in the Sales nav group + command palette
  (New Quotation action + Quotations page). `@page { size: A4 }` in globals.css.

## A4 print
Detail page `.print-area` reproduces the template: centered letterhead
(businessName + address + Tel from Settings), Branch/Date/Valid-until, "QUOTATION"
+ number, "Dear Sir, We are thankful…" intro, Customer Name/Address/Phone, the
Qty | Model | Product Details | Price table (multi-line details), totals, and the
"draw the cheque in favour of… / Yours faithfully" closing.

## Verified
tsc clean, lint clean, `next build` clean, 33 tests pass. Ran end-to-end against a
**local throwaway Postgres** (`madagama_dev_quo`, since dropped) — migrate deploy +
seed, inserted a solar-pump quotation, logged in, screenshotted the rendered A4
detail + the list (both faithful to the paper form). Prod Singapore DB untouched.

## TODO (user)
- **Prod:** `prisma migrate deploy` against the live DB **before** deploying the
  code (Vercel build runs `prisma generate && next build`, not migrate).
- Not committed (awaiting user).
- Possible follow-ups: convert-to-sale button, CSV export, dashboard "open
  quotations" stat, an optional "Dealers: …" tagline Setting for the letterhead.
