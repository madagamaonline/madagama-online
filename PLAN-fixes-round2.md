# Madagama — Fixes & Improvements (Round 2)

Plan covering 7 items raised after using the system. Decisions already confirmed:
- **Employee role** → job *position* from a preset dropdown (Sales Rep / Driver / Helper / Other).
- **Quick Add** on New Sale → **remove entirely**.
- **Phone** → validate Sri Lankan format **and** block duplicates, with a deliberate **override**.
- **Product stock** → keep as one-time **"opening stock"** on create; **lock it on edit** (all later stock via Purchases).

> ⚠️ This repo uses a customised Next.js (v16) — per `AGENTS.md`, check `node_modules/next/dist/docs/` before using any unfamiliar API. All changes below follow patterns that already exist in the repo (server actions + `useActionState` forms + Prisma).

---

## How products & purchasing work today (answer to your question)

- **Adding a product** sets stock directly via `quantityInStock` (`product-form.tsx:134`, `products/actions.ts`).
- **A Purchase** also **increments** that same `quantityInStock` and updates `costPrice` (`purchases/actions.ts:73-77`).
- **A sale** (cash or credit) **decrements** it (`credit/actions.ts:121-126`, and the cash-sale action).
- ❗ Problem: stock can be changed from **two** places (product edit form *and* purchases) → double-counting. Fix in Item 7: product edit becomes read-only for stock; the create form keeps a clearly-labelled one-time "opening stock".

---

## Item 1 — Suppliers: add Delete (Edit already exists)

**Finding:** Edit *does* exist (`/suppliers/[id]/edit` + `updateSupplier`), reachable via the "Edit" button on the supplier detail page (`suppliers/[id]/page.tsx:36`). There is **no Delete** anywhere, and the list page has no row actions.

**Changes**
- `src/app/(app)/suppliers/actions.ts` — add `deleteSupplier(id)`:
  - Guard: if the supplier has any `purchases` (FK `Purchase.supplierId` is required) → return error "Cannot delete: this supplier has purchase records." 
  - Disconnect products first (`Product.primarySupplierId` is optional): set `primarySupplierId: null` for its products, then delete.
  - `revalidatePath("/suppliers")`, `redirect("/suppliers")`.
- `src/components/delete-button.tsx` — **new** small `"use client"` confirm button (`window.confirm` → calls the passed server action). Reusable.
- `src/app/(app)/suppliers/[id]/page.tsx` — add a "Delete" button next to Edit (in the header action group, lines 34-47), wired to `deleteSupplier`.
- (Optional) add an Edit link on the list rows in `suppliers/page.tsx` for discoverability.

---

## Item 2 — Employees: assign a job position

**Finding:** `Employee` has **no** position/role field (`schema.prisma:143-160`). (Login roles for the 3 family members live on a separate `User` model — untouched here.)

**Changes**
- `prisma/schema.prisma` — add to `Employee`: `position String?` (free string, populated from a fixed dropdown). *(migration required)*
- `src/components/employee-form.tsx` — add a `<Select name="position">` with options: Sales Rep, Driver, Helper, Other; add `position` to `EmployeeInitial` + `empty`.
- `src/app/(app)/employees/actions.ts` — add `position: z.string().optional()` to schema + `parse()`; include `position: d.position?.trim() || null` in both `createEmployee` and `updateEmployee` data.
- `src/app/(app)/employees/[id]/edit/page.tsx` — pass `initial.position`.
- `src/app/(app)/employees/page.tsx` — show a "Position" column.

---

## Item 3 — Payroll: show the actual attendance dates

**Finding:** Payroll preview shows only a **count** ("Days") aggregated from attendance (`lib/payroll.ts:32-36`, `payroll/page.tsx:64`). The individual marked dates are never shown.

**Changes**
- `src/lib/payroll.ts` — extend `computePayroll` to also return per-employee `dates: { date: Date; status: AttendanceStatus }[]` (collect while iterating `attendance`). Add `dates` to `PayrollLineData`.
- `src/app/(app)/payroll/page.tsx` — render the dates in the "Days" cell using a native `<details><summary>{daysWorked}</summary>…</details>` (no client JS needed) listing each date + a P / ½ / A marker.
- *(Optional)* mirror this on the saved sheet `payroll/[id]/page.tsx` by re-querying `attendance` for `run.period` (saved `PayrollLine` doesn't store dates). Lower priority — the preview is what's checked day-to-day.

---

## Item 4 — New Sale: remove Quick Add

**Finding:** Quick Add = top-5 most-sold products as buttons (`new-sale.tsx:416-429`, data from `invoices/new/page.tsx:19-31,46`). Disruptive with a large catalog.

**Changes**
- `src/components/new-sale.tsx` — delete the `quickProducts` block (416-429); remove the `quickProducts` prop from the component's props/type.
- `src/app/(app)/invoices/new/page.tsx` — remove the top-products query and the `quickProducts` prop pass.
- Keep the search box and the "Recent invoices" strip untouched.

---

## Item 5 — Phone: Sri Lankan validation + duplicate blocking (with override)

**Finding:** Phone is a plain required string on `Customer` and `Guarantor`; **no validation, no dedupe**. A `normalizeLkPhone` exists but only inside the server-only `sms.ts`.

**New shared util** — `src/lib/phone.ts` (NOT `server-only`, so it's usable in client forms too):
- `normalizeLkPhone(raw)` — canonical local form `0XXXXXXXXX` (handle `94…`, `0…`, and bare-9-digit `7XXXXXXXX`).
- `validateLkPhone(raw): { ok; normalized?; error? }` — strip non-digits; accept 9-digit (`7XXXXXXXX`), 10-digit (`07XXXXXXXX`), or `94`-prefixed; require the normalized result to match `^0\d{9}$`; else "Enter a valid Sri Lankan phone number (e.g. 0771234567)."
- Refactor `src/lib/sms.ts` to import `normalizeLkPhone` from `phone.ts` (delete its private copy) — keeps one source of truth.

**Customers** — `src/app/(app)/customers/actions.ts`:
- In `createCustomer`/`updateCustomer`/`quickCreateCustomer`: run `validateLkPhone` first (format error if invalid); store the **normalized** value.
- Duplicate check: `prisma.customer.findFirst({ where: { phone: normalized, NOT: { id } } })`. If found and the override flag is **not** set → return `{ error: "A customer with this phone already exists.", duplicate: true }`.
- Override: read `formData.get("confirmDuplicate") === "on"` to bypass the block.
- `src/app/(app)/customers/actions.ts` `CustomerFormState` → add `duplicate?: boolean`.
- `src/components/customer-form.tsx` — when `state.duplicate`, show an amber warning + a `confirmDuplicate` checkbox ("Save anyway — this phone is already used"). Optional client-side format hint using `validateLkPhone`.
- `src/components/quick-customer-modal.tsx` — surface the same format error / duplicate warning + "add anyway" checkbox.

**Guarantors (credit sale)** — `src/app/(app)/credit/actions.ts` (`createCreditSale`):
- Validate `guarantor.phone` format.
- Fetch the borrowing customer's phone; if `normalize(guarantor.phone) === normalize(customer.phone)` → block: "Guarantor phone cannot be the same as the customer's phone." Allow bypass only if an explicit `allowDuplicatePhone` is passed on the input (wired to a checkbox in the credit form's guarantor section).
- Store the normalized guarantor phone.

**No DB unique constraint** — keep `@@index([phone])` only. A hard `@unique` would make the requested override impossible and could break on existing duplicate data.

---

## Item 6 — Settings: text.lk API key

**Finding:** Token is read from env `TEXTLK_API_TOKEN` (`sms.ts:28`). `Setting` has `smsSenderId`/`smsEnabled` but no key field.

**Changes**
- `prisma/schema.prisma` — add to `Setting`: `textlkApiToken String?` *(migration required)*.
- `src/app/(app)/settings/actions.ts` — add `textlkApiToken: z.string().optional()` to schema + read from form; persist `textlkApiToken: d.textlkApiToken?.trim() || null`.
- `src/components/settings-form.tsx` — add an `<Input type="password" name="textlkApiToken">` in the "SMS reminders" card; add to `SettingsInitial`; update the helper text (no longer "in environment").
- `src/app/(app)/settings/page.tsx` — include `textlkApiToken` in the `initial` passed to the form.
- `src/lib/sms.ts` — add optional `token` param to `sendSms`; resolve order = passed token → `process.env.TEXTLK_API_TOKEN`. Callers that already load `setting` pass `setting?.textlkApiToken`:
  - `src/app/(app)/credit/actions.ts` (`sendReminderNow:264`)
  - `src/lib/reminders.ts` (the `sendSms` call)
- Note: token is stored in plain text in the DB (acceptable for a single-admin family system); render as a password field.

---

## Item 7 — Product stock = opening stock only

**Changes**
- `src/components/product-form.tsx` — add an `isEdit?: boolean` (or `lockStock`) prop:
  - **Create:** keep the stock input, relabel "Opening stock (one-time)".
  - **Edit:** render current stock as **read-only** text + a note "Stock changes via Purchases / Sales."
- `src/app/(app)/products/actions.ts` — `updateProduct`: **stop** writing `quantityInStock` (ignore the field). `createProduct`: keep setting it as initial.
- `src/app/(app)/products/new/page.tsx` — pass `isEdit={false}`; `src/app/(app)/products/[id]/edit/page.tsx` — pass `isEdit`.
- *(Future, out of scope)* a dedicated "stock adjustment" action for corrections/stock-takes.

---

## Database migration

Two additive, nullable columns → safe migration:
- `Employee.position String?`
- `Setting.textlkApiToken String?`

Run: `npm run db:migrate` (i.e. `prisma migrate dev --name employee_position_and_textlk_token`). Then `npm run db:generate` is implicit. No data backfill needed.

---

## Critical files

| Area | Files |
|---|---|
| Suppliers delete | `suppliers/actions.ts`, `suppliers/[id]/page.tsx`, **new** `components/delete-button.tsx` |
| Employee position | `prisma/schema.prisma`, `employee-form.tsx`, `employees/actions.ts`, `employees/[id]/edit/page.tsx`, `employees/page.tsx` |
| Payroll dates | `lib/payroll.ts`, `payroll/page.tsx` |
| Remove Quick Add | `new-sale.tsx`, `invoices/new/page.tsx` |
| Phone validation/dedupe | **new** `lib/phone.ts`, `lib/sms.ts`, `customers/actions.ts`, `customer-form.tsx`, `quick-customer-modal.tsx`, `credit/actions.ts` (+ credit form guarantor section) |
| Settings text.lk key | `prisma/schema.prisma`, `settings/actions.ts`, `settings-form.tsx`, `settings/page.tsx`, `lib/sms.ts`, `lib/reminders.ts`, `credit/actions.ts` |
| Opening stock | `product-form.tsx`, `products/actions.ts`, `products/new/page.tsx`, `products/[id]/edit/page.tsx` |

---

## Verification (end-to-end)

1. **Migrate:** `npm run db:migrate` → confirm new columns in `npm run db:studio`.
2. **Unit test:** add `src/lib/phone.test.ts` for `validateLkPhone`/`normalizeLkPhone` (cases: `0771234567`, `771234567`, `94771234567`, `123` invalid). Run `npm run test`.
3. **Dev server:** `npm run dev`, log in, then:
   - **Suppliers:** delete a supplier with no purchases (works); a supplier with purchases (blocked with message).
   - **Employees:** create + edit with a Position; confirm it shows in the list.
   - **Payroll:** mark a few attendance dates (`/attendance`), open `/payroll`, expand "Days" → the dates appear.
   - **New Sale:** Quick Add buttons gone; product search still adds items.
   - **Phone:** save customer with `123` → format error; save a second customer with an existing phone → duplicate warning + override works; in a credit sale, set guarantor phone = customer phone → blocked.
   - **Settings:** enter a text.lk token, save; confirm persisted (studio); a reminder send uses it.
   - **Products:** create with opening stock; open Edit → stock is read-only; record a Purchase → stock increments.
4. **Lint:** `npm run lint`.

---

## Suggested implementation order

1. `lib/phone.ts` + sms refactor (foundation for Item 5).
2. Schema migration (Items 2 & 6 columns).
3. Items 1, 2, 4, 7 (independent UI/action edits).
4. Item 5 (customers, quick modal, credit guarantor).
5. Item 6 (settings + sms callers).
6. Item 3 (payroll dates).
7. Verification pass.
</content>
</invoke>
