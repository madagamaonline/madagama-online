# Madagama Pvt Ltd — Retail & Credit Management System
## Implementation Plan

A cloud web app for a Sri Lankan retail business (agricultural tools/spares + electronics/parts)
with inventory, VAT invoicing, flexible-installment credit sales with interest, supplier credit
purchasing, SMS reminders, payroll, expenses, and KPI dashboards.

---

## 1. Confirmed Decisions

| Area | Decision |
|------|----------|
| Hosting | Cloud web app — Vercel + cloud PostgreSQL (same stack as `jnexmultitenant`) |
| Reminders | **SMS** via **text.lk** (behind a swappable provider layer) |
| Logins/Roles | **Admin-only** login; admin selects which employee made each sale (for commission). Role enum kept so staff logins can be added later. |
| Interest | **2% / month on remaining principal**, non-compounding. Rate + grace period configurable in Settings. |
| Item codes | **Auto-generated structured**: `CATEGORY-SUBCATEGORY-NNNN` (e.g. `AGR-TOOL-0001`, `ELC-TV-0007`). Type-to-search on invoices. |
| VAT | **VAT-registered, 18%** (configurable). Per-item taxable/exempt flag. Proper tax invoices with TIN/VAT number. |
| Currency | LKR |

---

## 2. Tech Stack (matches your existing `jnex` project)

- **Next.js (App Router) + TypeScript** — single deployable web app
- **Prisma ORM + PostgreSQL** (Neon or Supabase) — relational data, migrations, money-safe `Decimal`
- **NextAuth (Credentials provider)** — admin login, `bcrypt` password hashing, `Role` enum
- **TailwindCSS + shadcn/ui (Radix)** — clean, large-control, non-tech-friendly UI
- **react-hook-form + zod** — validated forms
- **recharts** — KPI / sales-trend charts
- **jsPDF + jspdf-autotable** — invoices & salary-sheet PDFs
- **AWS S3 (or Supabase Storage) + presigned URLs** — NIC image uploads (same `@aws-sdk/client-s3` pattern as jnex)
- **Vercel Cron** — daily scheduled reminder job (`/api/cron/reminders`, protected by `CRON_SECRET`)
- **date-fns** — date math for interest/attendance/payroll
- **vitest** — unit tests for the interest engine and code generator (the two highest-risk pieces)

---

## 3. Data Model (Prisma schema — `prisma/schema.prisma`)

> All money fields use `Decimal(12,2)`. All tables get `createdAt/updatedAt`.

**Auth & config**
- `User` — id, name, email (unique), passwordHash, role (`ADMIN` | `STAFF`), active
- `Setting` — single config row: businessName, address, phone, tinVatNumber, logoKey,
  `vatRate` (0.18), `interestRatePerMonth` (0.02), `interestFreeMonths` (4),
  smsSenderId, reminder cadence options

**Catalog & stock**
- `Category` — id, name, code (e.g. `AGR`, `ELC`), unique code
- `Subcategory` — id, categoryId, name, code (e.g. `TOOL`, `SPRT`, `TV`, `PART`), unique (categoryId, code)
- `Product` — id, **code** (auto `AGR-TOOL-0001`), name, description, categoryId, subcategoryId,
  `costPrice`, `sellingPrice`, `quantityInStock`, `reorderLevel`, `isVatable`, `barcode?`, `primarySupplierId?`, active

**People**
- `Customer` — id, name, nic, phone, address, email?, nicFrontKey, nicBackKey
- `Guarantor` — id, name, nic, phone, address, nicFrontKey, nicBackKey (linked per credit agreement)
- `Employee` — id, name, nic, phone, address, `dailyRate`, joinedDate, active
- `Supplier` — id, name, contactPerson, phone, email?, address

**Sales / invoicing**
- `Invoice` — id, **invoiceNumber** (auto), type (`CASH` | `CREDIT`), customerId?, soldByEmployeeId?,
  subtotal, vatTotal, discount, grandTotal, amountPaid, status (`PAID` | `PARTIAL` | `CREDIT`), createdByUserId
- `InvoiceItem` — id, invoiceId, productId, nameSnapshot, qty, unitPrice, isVatable, vatAmount, lineTotal
  *(creating an invoice decrements `Product.quantityInStock` in a transaction)*

**Credit engine**
- `CreditAgreement` — id, invoiceId (1:1), customerId, guarantorId, principal, startDate,
  `interestRatePerMonth` (snapshot), `interestFreeMonths` (snapshot), status (`ACTIVE` | `SETTLED` | `DEFAULTED`)
- `InterestCharge` — id, agreementId, period (`YYYY-MM`), principalBase, amount *(created monthly by cron; auditable)*
- `Payment` — id, agreementId, amount, paidDate, method, note, recordedByUserId *(flexible amounts, no fixed schedule)*

**Purchasing / supplier credit**
- `Purchase` (GRN) — id, supplierId, supplierInvoiceNo?, date, type (`CASH` | `CREDIT`), total, amountPaid, creditDueDate?, status
- `PurchaseItem` — id, purchaseId, productId, qty, costPrice *(increments stock)*
- `PurchasePayment` — id, purchaseId, amount, paidDate, note

**Payroll & HR**
- `Attendance` — id, employeeId, date, status (`PRESENT` | `ABSENT` | `HALF_DAY`), note; unique (employeeId, date)
- `Commission` — id, employeeId, invoiceId?, amount, reason, date *(ad-hoc / one-off)*
- `PayrollRun` — id, period (`YYYY-MM`), generatedAt
- `PayrollLine` — id, runId, employeeId, daysWorked, dailyRate, baseSalary, commissionsTotal, deductions, netPay

**Finance & ops**
- `Expense` — id, category (rent/utilities/bills/misc), amount, date, description, attachmentKey?
- `NotificationLog` — id, type (`CUSTOMER_PAYMENT` | `INTEREST_WARNING` | `SUPPLIER_CREDIT` | `ADMIN_DIGEST`), refId, channel, recipient, message, status (`SENT` | `FAILED`), sentAt *(prevents duplicate sends)*

---

## 4. Key Business Logic

### 4.1 Auto item code (`src/lib/product-code.ts`)
`code = category.code + "-" + subcategory.code + "-" + zeroPad(nextSeqForSubcategory, 4)`.
Sequence is per-subcategory, generated inside a DB transaction to avoid duplicates. Unique constraint on `Product.code`. Invoice screen searches by code **or** name as you type.

### 4.2 Interest engine (`src/lib/credit.ts`) — pure, unit-tested
Single pure function `computeCreditState(agreement, charges[], payments[], asOf)` returns:
`{ monthsElapsed, inGracePeriod, principalRemaining, interestAccrued, totalPaid, outstanding, isOverdue }`.

Rules:
- Months 1–4 (`interestFreeMonths`): **no interest**. If fully paid within grace → 0 interest.
- After grace: each elapsed month adds `InterestCharge = interestRatePerMonth × principalRemaining`.
- **Non-compounding**: interest base is always *remaining principal only*, never on accrued interest.
- Payment allocation: clears outstanding accrued interest first, remainder reduces principal *(documented rule — easy to flip to principal-first if you prefer; confirm during build)*.
- `outstanding = principalRemaining + (interestAccrued − interestPaid)`.
- Monthly Vercel cron writes one `InterestCharge` per active, post-grace agreement (auditable ledger). The UI computes live balances from the ledger + payments so it's always correct between cron runs.

### 4.3 VAT (`src/lib/vat.ts`)
Per line: `vatAmount = isVatable ? lineTotal − lineTotal/(1+vatRate)` (VAT-inclusive) **or** `lineTotal × vatRate` (VAT-exclusive) — confirm which during build (SL retail prices are usually VAT-inclusive). Invoice shows subtotal, VAT total, grand total + business TIN/VAT number.

### 4.4 Payroll (`src/lib/payroll.ts`)
`netPay = (daysWorked × dailyRate) + commissionsInMonth − deductions`. Generate a `PayrollRun` snapshot for the month → salary-sheet PDF per employee + summary.

### 4.5 Rough profit (reports)
`profit ≈ salesRevenue − COGS(from InvoiceItem cost) − expenses − payroll + interestIncome`.

---

## 5. Pages / UX (clean, non-tech-friendly, keyboard-fast billing)

- `/login`
- `/dashboard` — daily/weekly/monthly sales, sales-trend chart, receivables outstanding, overdue credit count, supplier payables due, low-stock alerts
- `/invoices/new` — **fast POS-style billing**: type code → autocomplete → add → qty → auto VAT → Cash or Credit. Credit path: pick/add customer + guarantor + upload NICs → create agreement → print PDF
- `/invoices` — list / view / reprint
- `/products` — CRUD, categories & subcategories, stock levels, reorder alerts
- `/customers` — profiles, NIC images, credit history & live balance
- `/credit` — agreements list with balances, record payment, "send reminder now", interest/overdue status
- `/suppliers` + `/purchases` — GRN entry (increments stock), supplier credit & due dates
- `/employees`, `/attendance` (daily grid/calendar), `/commissions`
- `/payroll` — generate month salary sheet → PDF
- `/expenses`
- `/reports` — sales trends, profit, top products/employees
- `/settings` — business info, VAT %, interest rate, grace period, SMS config

---

## 6. Reminders (`/api/cron/reminders`, Vercel Cron daily)
- **Customer:** monthly outstanding reminder; **warning ~1 week before the 4-month mark** that interest will start; monthly overdue reminders after grace. → SMS via text.lk.
- **Supplier credit:** alert admin (SMS + in-app) when a `Purchase` credit due date is approaching/overdue.
- **Admin digest:** optional daily/weekly summary of dues & sales.
- Every send is logged in `NotificationLog` to avoid duplicates; endpoint guarded by `CRON_SECRET`.

---

## 7. Build Order (phased, each phase shippable)
0. **Scaffold** — Next.js + Prisma + Postgres + NextAuth, Settings, seed admin + categories/subcategories
1. **Catalog & stock** — categories, auto-code products, stock
2. **Cash invoicing** — VAT, PDF, stock decrement, basic sales KPIs
3. **Credit sales** — customer + guarantor + NIC upload + flexible payments + interest engine (+ unit tests)
4. **Purchasing** — suppliers, GRN, supplier credit
5. **Reminders** — Vercel cron + text.lk SMS (customer, supplier, admin)
6. **HR/Payroll** — employees, attendance, commissions, salary-sheet PDF
7. **Finance** — expenses, profit report, advanced trends
8. **Polish & deploy** — validation, DB backups, Vercel deploy with env vars

---

## 8. Critical Files (to be created)
- `prisma/schema.prisma`, `prisma/seed.ts`
- `src/lib/prisma.ts`, `src/lib/auth.ts`, `src/lib/sms.ts` (text.lk), `src/lib/pdf.ts`
- `src/lib/product-code.ts`, `src/lib/credit.ts`, `src/lib/vat.ts`, `src/lib/payroll.ts`
- `src/app/**` route handlers + pages (per section 5)
- `src/app/api/cron/reminders/route.ts`
- `vercel.json` (cron schedule), `.env` (DATABASE_URL, NEXTAUTH_SECRET, S3 creds, TEXTLK_API_TOKEN, CRON_SECRET)

---

## 9. Verification
- **Local:** `npm run dev`; `prisma migrate dev`; seed → log in.
- **Unit tests (`vitest`):** interest engine (grace period boundary, partial payments, non-compounding base, overdue) and product-code generator (no duplicates, correct prefixes).
- **Manual end-to-end flows:**
  1. Create category/subcategory → add product → verify auto code.
  2. Cash invoice → VAT totals correct → stock decrements → PDF prints.
  3. Credit sale → guarantor + NIC upload → make 3 uneven payments → balance correct → pass 4-month mark → interest appears at 2% of remaining principal.
  4. Supplier credit purchase → stock increments → due-date alert.
  5. Trigger `/api/cron/reminders` manually → SMS sent + logged, no duplicates.
  6. Attendance for a month + a commission → generate payroll → salary sheet PDF.
  7. Log expenses → dashboard KPIs + rough profit reflect everything.
- **Deploy:** push to Vercel, set env vars, confirm cron registered and DB migrated.

---

## 10. Assumptions to confirm during build
- VAT prices are **VAT-inclusive** (typical SL retail). Flip in `vat.ts` if exclusive.
- Credit payment allocation = **interest-first, then principal** (alternative: principal-first).
- One guarantor required per credit sale (as stated). NIC front+back images for customer and guarantor.
- text.lk used directly via HTTP; SMS layer abstracted so provider can change without touching business code.
