# Plan — Workflow, Dashboard & Feature Improvements

The 8-phase build is complete and verified. This plan covers **incremental improvements**, not new
foundations. It is split into:

1. **Batch A — POS / workflow speed** (highest day-to-day value)
2. **Batch B — Dashboard depth**
3. **Batch C — "Nice-to-have" features** (prioritized menu to pick from)
4. **Batch D — Structural / hardening** (do when scaling beyond admin-only)

Recommended order: **A → B**, then pick from **C**. Each item lists concrete files + scope so any
subset can be done independently.

> **DECIDED SCOPE (2026-06-24):** Do **Batch A + Batch B** now, as one pass. Agreed backlog to do
> next (in order): **C2 stock adjustments + audit → C1 returns/refunds → C3 global search + C4 export.**
> Other C/D items deferred.
>
> **STATUS: Batch A + B DONE (2026-06-24).** A1–A6 + B1–B5 implemented; `new-sale.tsx`,
> `credit-sale.tsx`, `dashboard/page.tsx` changed. No schema changes. lint + build clean, 9 tests
> pass. (B6 chart consolidation intentionally skipped — kept the bespoke dashboard bars.) **Next up: C2.**

---

## Batch A — POS / Workflow speed (recommended first)

The cash sale (`src/components/new-sale.tsx`) is functional but missing classic POS ergonomics. These
are small, high-impact changes to the busiest screen in the app.

### A1. Cash tendered + change calculator  *(small)*
On `new-sale.tsx` summary panel (after the Total, ~line 342): add a "Cash received" input and show
**Change due = tendered − grandTotal** live. Optional: quick-tender chips (round up to next 500/1000).
Persist `amountPaid`/change is display-only (cash sale is already fully paid). No schema change.

### A2. Keyboard navigation in the product search dropdown  *(small)*
`new-sale.tsx` lines 184–211 only handle `Enter` → first hit. Add ↑/↓ to move a highlighted index,
`Enter` to add the highlighted hit, `Esc` to clear/close. Mirror into `credit-sale.tsx` (same pattern).

### A3. Cash ⇆ Credit toggle on one screen  *(medium)*
Today credit is a separate page; the cashier must know upfront. Add a **Cash / Credit segmented toggle**
at the top of the sale screen. "Credit" reveals the customer/guarantor/NIC block (reuse `credit-sale.tsx`
fields) and routes to `createCreditSale`; "Cash" keeps current path. Lowest-risk version: keep two
pages but add a prominent "Switch to Credit (keep cart)" button that carries the cart via query/session.

### A4. Hold / resume sale (draft cart)  *(small–medium)*
Cart is lost on navigation. Persist cart to `localStorage` on change; offer "Resume held sale" on load,
and a "Hold" button to stash + clear. Pure client-side, no backend.

### A5. Reprint / receipt shortcuts  *(small)*
Success panel already links View/Print. Add: keep last 3 completed invoices accessible from the new-sale
screen ("Recent: TX-000123 ⧉ print") so a reprint doesn't require navigating to `/invoices`.

### A6. Finish the warm-paper restyle on sale screens  *(small, cleanup)*
`new-sale.tsx` still has bright leftovers flagged in the design handoff: `hover:bg-slate-50` (line 200),
`bg-amber-50/text-amber-800` (line 346), `bg-red-50/text-danger` (line 352), `hover:bg-red-50` (line 266).
Swap for `clay-soft`/`danger-soft`/`input` tokens to match the rest of the app.

**Verify A:** `npm run dev`; ring up a mixed cart → tendered shows change; arrow-key add works; hold +
resume restores cart; restyle has no slate/bright-50 classes left (`grep -rn "bg-slate-\|bg-amber-50\|bg-red-50" src/components/new-sale.tsx`).

---

## Batch B — Dashboard depth

`src/app/(app)/dashboard/page.tsx` is already attractive (hero KPI, 7-day bars, needs-attention,
recent invoices). Gaps: no cash/credit split, no profit signal, no employee/collection view, fixed period.

### B1. Trend arrows + clearer deltas  *(tiny)*
KPI cards show `%` but no direction glyph. Add ▲/▼ (lucide `TrendingUp/Down`) tinted primary/danger in
`KpiCard` (line 307) and the hero card. Pure presentation.

### B2. Cash vs Credit split on "Today/Week"  *(small)*
The today/week/month aggregates (`page.tsx` lines 46–51) don't distinguish type. Add `type` to a
`groupBy` so the hero card can show "Cash 80% · Credit 20%" as a thin bar or sub-line.

### B3. "Money in today" + collections widget  *(small–medium)*
Add a card summing **`Payment.amount` where paidDate = today** (credit instalments collected) alongside
sales — owners care about cash actually received, not just billed. Source: `prisma.payment.aggregate`.

### B4. Today's gross profit chip  *(small)*
Reports already computes revenue − COGS. Surface a lightweight **today's gross profit** estimate on the
dashboard (sum of `InvoiceItem` lineTotal − qty×product.costPrice for today). One extra query.

### B5. Top employee / top product mini-lists this week  *(small)*
Add a compact "Top sellers this week" (group `Invoice.soldByEmployeeId`) and reuse the reports
top-products query scoped to the week. Fills the empty visual space below the chart on wide screens.

### B6. Switch the hand-rolled 7-day bars to `<SalesChart>`  *(optional, tiny)*
`reports/page.tsx` uses the polished recharts `SalesChart`; the dashboard reimplements bars by hand
(lines 182–205). Optional consolidation for consistent tooltips/axes — or keep the custom bars if the
bespoke look is preferred. Low priority.

**Verify B:** dashboard shows arrows, cash/credit split, money-in-today, today's profit, and top
lists with real seeded data; numbers reconcile against `/reports` and `/credit`.

---

## Batch C — Nice-to-have features (pick from this menu)

Ranked by value-for-effort for a Sri Lankan retail + credit shop. Each is self-contained.

| # | Feature | Why it matters | Effort | Touches |
|---|---------|----------------|--------|---------|
| C1 | **Returns / refunds** | No way to reverse a sale, restock, or issue a credit note. Real gap for a shop selling spares/electronics with warranty. | M–L | new `Return`/`CreditNote` model, `invoices/[id]` action, stock restore |
| C2 | **Stock adjustments + audit** | `reorderLevel` exists but stock only moves via sale/purchase. Need manual write-off (damage/theft) + physical-count reconcile with a reason log. | M | new `StockAdjustment` model, `/products/adjustments` |
| C3 | **Global search (Ctrl/⌘-K)** | Navigation is menu-only. A command palette over products, customers, invoices, suppliers is a big speed win. | M | new `/api/search`, `cmdk`-style component in `app-shell.tsx` |
| C4 | **CSV / Excel export** | Owner/accountant can't get data out except print. Export invoices, credit ledger, expenses, stock. | S–M | `/api/export/*`, reuse existing queries |
| C5 | **Customer statement (PDF + SMS link)** | Credit customers want an account summary; SMS layer already exists. | M | `/customers/[id]` statement view, reuse `window.print` + `sms.ts` |
| C6 | **Low-stock → draft purchase order** | Turn the reorder alerts into a one-click "create purchase for short items by supplier". | M | reuse `purchases/new`, prefill from low-stock query |
| C7 | **SMS receipt / payment confirmation** | After a sale or payment, optionally text the customer total + balance. SMS provider already wired. | S | hook into `createCashInvoice` / `recordPayment`, `sms.ts` |
| C8 | **Quotations → invoice** | Let staff issue a quote that converts to a sale, common for tools/spares. | M | new `Quotation` model mirroring invoice |
| C9 | **Barcode label printing** | `barcode` field exists but no label output; products have codes. | S–M | `jsbarcode` + printable label sheet from `/products` |
| C10 | **WhatsApp channel** | Higher open-rate than SMS in LK; abstract `sms.ts` → `sendMessage(channel)`. | M | extend provider layer, settings toggle |
| C11 | **Dark mode** | Low-light shop comfort; tokens are already CSS-variable based. | S | `next-themes` + dark `@theme` block in `globals.css` |
| C12 | **PWA / installable + basic offline shell** | Rural connectivity; installable app, cached shell. (True offline writes are L — defer.) | M | `next-pwa`/manifest + service worker |
| C13 | **Sinhala/Tamil i18n** | Staff/customer language. Larger effort; do only if needed. | L | `next-intl`, externalize strings |

**Recommended first picks from C:** **C2 (stock adjustments)** and **C4 (export)** are the most-missed
operational gaps; **C3 (global search)** and **C7 (SMS receipts)** are the best UX wins for low effort.

---

## Batch D — Structural / hardening (when going beyond admin-only)

Not urgent while it's a single admin user, but needed before staff logins:

- **D1. Enforce roles (RBAC).** `User.role` (ADMIN/STAFF) exists but isn't checked. Add route/action
  guards in `src/middleware.ts` + per-action checks once STAFF logins are enabled.
- **D2. Audit log.** New `AuditLog` model + a thin wrapper around mutating server actions (who/what/when)
  for accountability on price edits, payments, settings.
- **D3. middleware → proxy rename** (already noted as pending in project memory).
- **D4. Backup/export job.** Scheduled DB dump or a "download everything" admin button for peace of mind.

---

## Critical files (reference)

- Dashboard: `src/app/(app)/dashboard/page.tsx`
- Reports: `src/app/(app)/reports/page.tsx` · charts `src/components/sales-chart.tsx`
- Cash sale: `src/components/new-sale.tsx` · action `src/app/(app)/invoices/actions.ts`
- Credit sale: `src/components/credit-sale.tsx` · `src/app/(app)/credit/actions.ts`
- Search API: `src/app/api/products/search/route.ts`
- Shell/nav: `src/components/app-shell.tsx`
- SMS layer: `src/lib/sms.ts` · reminders `src/lib/reminders.ts`
- Schema: `prisma/schema.prisma`
- Tokens: `src/app/globals.css` (`@theme`)

## Global verification

After any batch: `npm run build` (clean), `npm run lint`, `npm test` (9 unit tests stay green), then
run `npm run dev` and exercise the touched flow end-to-end against seeded data (admin@madagama.lk /
admin123). Any new model → `prisma migrate dev` (dev data is sample data; `migrate reset` + `db:seed`
is fine).
