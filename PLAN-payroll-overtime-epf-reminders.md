# Plan — Overtime, Salary Advances, EPF/ETF, and a Payment-Reminders page

Date: 2026-06-29 · Scope decided with the user (see "Decisions" below).

## What we're building
1. **Overtime pay** — record extra pay for hours worked beyond normal; folds into gross at payroll.
2. **Salary advances** — pay money up front, auto-recovered (deducted) from a later payroll.
3. **EPF/ETF statutory deductions** — employee 8% EPF deducted from pay; employer 12% EPF + 3% ETF tracked as company cost. Per-employee membership flag; computed on **basic wages only**.
4. **`/reminders` page** — one categorized hub for *Customers owe you* (credit) + *You owe suppliers* (payables), grouped by urgency + entity, with quick links and one-tap "Send SMS".
5. Small hardening: add ADMIN guards to the payroll-money actions (commissions today has **none**).

## Decisions (confirmed)
- "Pay over time" = **overtime + advances** (NOT salary installments — that's out of scope).
- EPF/ETF: **per-employee member flag**; casual helpers excluded. Rates configurable in Settings (defaults: EPF employee **8%**, employer **12%**, ETF **3%**).
- EPF/ETF base = **basic wages only** (`daysWorked × dailyRate`); overtime + commissions excluded from the base.
- Reminders page = **grouped list + quick links** (links to credit/supplier pages + inline "Send SMS" on customer rows).
- Commissions stay **manual/ad-hoc** (unchanged). Auto-commission-from-sale is a possible future add, not in this work.

## Sri Lankan EPF/ETF rules being implemented
| Fund | Rate | Paid by | Payslip effect |
|------|------|---------|----------------|
| EPF | 8% | Employee | **Deducted** from net |
| EPF | 12% | Employer | Company cost (tracked, not deducted) |
| ETF | 3% | Employer | Company cost (tracked, not deducted) |

Payslip math per employee/month:
```
base        = daysWorked × dailyRate            (existing)
overtime    = Σ Overtime.amount in month        (new)
commissions = Σ Commission.amount in month      (existing)
gross       = base + overtime + commissions
epfEmployee = member ? base × epfEmployeeRate : 0     # 8%, deducted
epfEmployer = member ? base × epfEmployerRate : 0     # 12%, employer cost
etf         = member ? base × etfRate : 0             # 3%,  employer cost
advanceDed  = greedy oldest-first outstanding advances that fit (gross − epfEmployee), no partial split
deductions  = epfEmployee + advanceDed
net         = gross − deductions
employerCost (info only) = gross + epfEmployer + etf
```

---

## Part A — Payroll (overtime, advances, EPF/ETF)

### A1. Schema (`prisma/schema.prisma`) — additive
- `Setting`: add `epfEmployeeRate Decimal @default("0.08") @db.Decimal(6,4)`, `epfEmployerRate Decimal @default("0.12") @db.Decimal(6,4)`, `etfRate Decimal @default("0.03") @db.Decimal(6,4)`.
- `Employee`: add `epfEtfMember Boolean @default(false)`, `epfNumber String?`; add back-relations `overtime Overtime[]`, `advances SalaryAdvance[]`.
- New model `Overtime` (mirror of `Commission`):
  ```prisma
  model Overtime {
    id         String   @id @default(cuid())
    employee   Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
    employeeId String
    date       DateTime @default(now())
    hours      Decimal  @db.Decimal(6, 2)
    rate       Decimal  @db.Decimal(12, 2)   // per-hour rate
    amount     Decimal  @db.Decimal(12, 2)   // hours × rate, computed at entry
    reason     String?
    createdAt  DateTime @default(now())
    @@index([date])
  }
  ```
- New enum + model for advances:
  ```prisma
  enum AdvanceStatus { OUTSTANDING RECOVERED }
  model SalaryAdvance {
    id             String        @id @default(cuid())
    employee       Employee      @relation(fields: [employeeId], references: [id], onDelete: Cascade)
    employeeId     String
    amount         Decimal       @db.Decimal(12, 2)
    date           DateTime      @default(now())
    note           String?
    status         AdvanceStatus @default(OUTSTANDING)
    recoveredRunId String?       // PayrollRun.id that recovered it (loose ref, no FK)
    recoveredAt    DateTime?
    createdAt      DateTime      @default(now())
    @@index([employeeId, status])
  }
  ```
- `PayrollLine`: add `overtimeTotal`, `epfEmployee`, `epfEmployer`, `etf`, `advanceDeduction` — all `Decimal @default("0") @db.Decimal(12,2)`. Keep existing `deductions` (set = `epfEmployee + advanceDeduction`).

**Migration (critical — drift is resolved, do NOT regress):**
- Local: `npx prisma migrate dev --name add_overtime_advances_epf_etf`
- Prod: `npx prisma migrate deploy` against the live Singapore DB. **Do NOT `prisma db push`** (reintroduces drift).

### A2. `src/lib/payroll.ts`
- Extend `PayrollLineData` with: `overtimeTotal, grossPay, epfEtfMember, epfEmployee, epfEmployer, etf, advanceDeduction, deductions, employerCost`.
- In `computePayroll(month)`: also fetch `overtime` by month and the employee's `epfEtfMember`. Fetch rates via `getSettings()` (cached). Compute base/overtime/commissions/gross/EPF/ETF per the formula. For the **preview** advance number, read each employee's `OUTSTANDING` advances and compute a greedy `advanceDeduction` (display only). `net = gross − epfEmployee − advanceDeduction`. Keep this function side-effect-free (no writes).

### A3. `src/app/(app)/payroll/actions.ts` — `generatePayroll`
- Compute the non-advance fields from `computePayroll`.
- Inside the existing `$transaction` (raise `timeout` if needed):
  1. **Un-recover** advances of *this* run: `tx.salaryAdvance.updateMany({ where: { recoveredRunId: id }, data: { status:"OUTSTANDING", recoveredRunId:null, recoveredAt:null } })` (idempotent regeneration).
  2. Per employee: re-read `OUTSTANDING` advances oldest-first via `tx`; greedily pick advances whose running sum ≤ `gross − epfEmployee` (no partial split); `tx.salaryAdvance.update` each picked → `RECOVERED, recoveredRunId=id, recoveredAt=now`. Sum = authoritative `advanceDeduction`.
  3. Persist `PayrollLine` rows with all new columns; `deductions = epfEmployee + advanceDeduction`; `netPay = gross − deductions`.
- Note: `computePayroll` runs outside the tx, so advance application is done **authoritatively in-tx** (its preview advance number is ignored at save time).

### A4. Overtime entry UI (mirror `/commissions`)
- `src/app/(app)/overtime/actions.ts`: `createOvertime` (zod: employeeId, hours>0, rate>0, date?, reason?; `amount = round2(hours*rate)`) + `deleteOvertime`. **ADMIN-guarded** via the `requireAdminState()` pattern.
- `src/app/(app)/overtime/page.tsx` + `src/components/add-overtime.tsx` (employee `<Select>`, `NumberInput` hours & rate with a live "= LKR amount" hint, date, reason). Mirror `add-commission.tsx`.
- Surface "Add overtime" + "Add commission" links on the Payroll page header (commissions has no main-nav entry today; keep that convention).

### A5. Salary-advance UI
- `src/app/(app)/advances/actions.ts`: `createAdvance` (employeeId, amount>0, date?, note?) + `deleteAdvance` (only if `OUTSTANDING`). **ADMIN-guarded.**
- `src/app/(app)/advances/page.tsx` + `src/components/add-advance.tsx`: add form + list showing status (Outstanding/Recovered) and which run recovered it.

### A6. Settings + Employee form + payslip
- `prisma.setting` already read via `src/lib/settings.ts getSettings()` (cached) — extend the select/type with the 3 rates.
- `src/app/(app)/settings/settings-actions.ts updateSettings`: add `epfEmployeeRate/epfEmployerRate/etfRate` to the **ADMIN-gated** field set (same guard as interest/tax fields). Add an admin-only "EPF / ETF rates" card to the Settings page.
- `src/components/employee-form.tsx` + `employees/actions.ts`: add `epfEtfMember` checkbox + `epfNumber` text (actions already ADMIN-only).
- Payroll preview table (`payroll/page.tsx`) + saved sheet (`payroll/[id]/page.tsx`): add Overtime, EPF (8%), Advance, Net columns; show an "Employer contributions (EPF 12% + ETF 3%)" subtotal for remittance.

### A7. Hardening
- Add `requireAdminState()` guard to `commissions/actions.ts createCommission`/`deleteCommission` (currently unguarded).

---

## Part B — `/reminders` page

### B1. Route + nav
- New `src/app/(app)/reminders/page.tsx` (`export const dynamic = "force-dynamic"`, server component).
- `src/components/app-shell.tsx`: add `{ href: "/reminders", label: "Reminders", icon: Bell }` to the first nav group (next to Dashboard) for prominence; import `Bell` from `lucide-react`.

### B2. Data (reuse existing logic — same as `runReminders`/dashboard)
- **Receivables:** `prisma.creditAgreement.findMany({ where:{status:"ACTIVE"}, include:{ customer, payments, invoice }})` → `computeCreditState()` → keep `outstanding>0` → `daysToGrace = differenceInCalendarDays(state.graceEndDate, now)`. Bucket: **Overdue** (`state.isOverdue`), **Due ≤7d** (`0..7`), **Later**.
- **Payables:** `prisma.purchase.findMany({ where:{ status:{in:["CREDIT","PARTIAL"]}, creditDueDate:{not:null} }, include:{ supplier }})` → `balance = toNum(total)−toNum(amountPaid)` → keep `balance>0` → `days = differenceInCalendarDays(creditDueDate, now)`. Bucket the same way; **group rows by supplier** with a per-supplier subtotal.

### B3. Layout
- `PageHeader` + 4 `StatCard`s: Receivable overdue (red), Receivable due ≤7d (amber), Payable overdue (red), Payable due ≤7d (amber).
- Two sections: **"Customers owe you"** and **"You owe suppliers"**, each with urgency sub-headers (Overdue → Due today → Due this week), reusing the dashboard `dueLabel(days)` helper (extract it to `src/lib/utils.ts` so both pages share it).
- Customer rows: link → `/credit/[id]` + inline **Send SMS** button (new tiny client component `SendReminderButton` calling the existing `sendReminderNow(agreementId)` from `credit/actions.ts`, `useTransition` + inline result text).
- Supplier rows (grouped by supplier): link → `/purchases/[id]` (record payment lives there).

---

## Critical files
- `prisma/schema.prisma` (Setting, Employee, PayrollLine + new Overtime/SalaryAdvance/AdvanceStatus)
- `src/lib/payroll.ts`, `src/app/(app)/payroll/actions.ts`, `src/app/(app)/payroll/page.tsx`, `src/app/(app)/payroll/[id]/page.tsx`
- `src/app/(app)/overtime/*`, `src/app/(app)/advances/*`, `src/components/add-overtime.tsx`, `src/components/add-advance.tsx`
- `src/lib/settings.ts`, `src/app/(app)/settings/settings-actions.ts`, `src/app/(app)/settings/page.tsx`
- `src/components/employee-form.tsx`, `src/app/(app)/employees/actions.ts`
- `src/app/(app)/commissions/actions.ts` (add guard)
- `src/app/(app)/reminders/page.tsx`, `src/components/app-shell.tsx`, `src/components/send-reminder-button.tsx`, `src/lib/utils.ts` (shared `dueLabel`)

## Verification
- **Unit tests** (new `src/lib/payroll.test.ts`, runs under `TZ=UTC` like the others):
  - EPF 8% on base only; member vs non-member (non-member = 0).
  - Overtime + commissions added to gross but excluded from EPF base.
  - Advance greedy recovery: full advance recovered when it fits; deferred whole when it would push net < 0; net never negative.
  - Regeneration idempotency: generating the same month twice doesn't double-recover (un-recover-first logic).
  - Keep existing **25 tests** green.
- **tsc + lint + build clean**: `npm run lint && npx tsc --noEmit && npm run build`.
- **Manual (dev server)**: create an EPF-member employee + a non-member; mark attendance; add overtime + an advance; generate payroll → verify payslip math + employer-contribution subtotal + advance shows RECOVERED. Open `/reminders` → confirm overdue/ due-soon customers and suppliers are grouped correctly and "Send SMS" works (simulated if SMS not configured).
- **DB**: `npx prisma migrate dev` locally; `npx prisma migrate deploy` on prod. Confirm `prisma migrate status` = up to date.

## Out of scope (flag to user)
- Salary **installment** payments / disbursement tracking (you reinterpreted "pay over time" as overtime).
- **Auto-commission** from sale amount (commissions stay manual — easy future add via `Invoice.soldByEmployeeId`).
- **Partial** recovery of a single advance across multiple months (advances recover whole-or-defer).
- B2 blob cleanup, multi-currency, etc.
