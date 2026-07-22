# Feature: Pay Later / Customer Open Accounts

## Outcome

When a known customer takes goods without paying immediately, record a real
sale with an unpaid accounts-receivable balance:

- issue and print the invoice immediately;
- decrement stock and recognize the sale/COGS immediately;
- collect zero or more later payments without interest or a guarantor;
- keep formal interest-bearing Credit Agreements unchanged;
- show the customer's outstanding balance, payment history, and optional
  promised payment date.

User-facing names:

- checkout action: **Pay Later**;
- management area: **Customer Balances** or **Open Accounts**;
- existing installment flow: **Formal Credit (interest terms)**.

## Recommended design

Add a separate `OpenAccount` aggregate and `OpenAccountPayment` ledger. Do not
encode this as a `CreditAgreement` with a zero rate: the existing credit engine
assumes grace periods, future interest, guarantors, and credit-specific SMS and
print wording. Do not migrate all payments to a generic invoice-payment model
in this feature; that is a much larger accounting refactor.

An unpaid invoice is still a sale. Payment timing affects cash and receivables,
not whether inventory/revenue was recorded.

### Prisma

Modify `prisma/schema.prisma` and add an additive timestamped migration:

- add `OPEN_ACCOUNT` to `InvoiceType`;
- add `OpenAccountStatus { ACTIVE SETTLED VOIDED }`;
- add `OpenAccount` with `invoiceId @unique`, required `customerId`, `principal`,
  `openedAt`, optional `dueDate`, status, timestamps, and payments;
- add `OpenAccountPayment` with account, amount, paid/effective date, method,
  note, recording user, and creation time;
- add back-relations on `Invoice`, `Customer`, and `User`;
- index account status/customer/due date and payment account/date.

Keep `InvoiceStatus` unchanged:

- `OPEN_ACCOUNT + CREDIT` = Unpaid;
- `OPEN_ACCOUNT + PARTIAL` = Partially paid;
- `OPEN_ACCOUNT + PAID` = Settled.

Render friendly labels rather than raw enum names. No old rows need a backfill,
and existing `CreditAgreement`, `Payment`, and `InterestCharge` rows remain
untouched.

## Implementation

### 1. Pure account math

Add `src/lib/open-account.ts` and `src/lib/open-account.test.ts` as the single
source of truth for:

- collected amount, outstanding balance, settlement, and optional overdue
  status;
- classification of real cash payments versus `RETURN` balance credits;
- due-date handling in the Asia/Colombo business calendar.

Do not use `computeCreditState` for open accounts.

### 2. Create the sale from the existing POS

Refactor the private mechanics in `src/app/(app)/invoices/actions.ts` so cash and
Pay Later use the same validated, serializable sale pipeline:

1. authenticate and authorize;
2. validate Zod input, unique product lines, customer, products, stock, prices,
   and the non-taxable switch;
3. split mixed taxable/non-taxable baskets and allocate the discount exactly as
   the cash flow does now;
4. generate invoice numbers, create invoice/items, decrement stock, and write
   `SALE` stock movements;
5. for Pay Later, create an `OPEN_ACCOUNT` invoice with `amountPaid = 0`, status
   `CREDIT`, and one `OpenAccount` for each generated invoice;
6. commit all invoice/account/stock work in the existing Serializable
   transaction with conflict retries.

Add `createOpenAccountSale`. Require a selected customer; never allow a walk-in
Pay Later invoice. Recommended authorization is ADMIN/STAFF only, enforced in
the Server Action as well as the UI.

Modify `src/components/new-sale.tsx`:

- keep **Complete Cash Sale** primary;
- add **Pay Later** without moving/rebuilding the cart;
- require/select/quick-add the customer;
- confirm customer, total, received now (LKR 0), balance due, optional promised
  date, and “No interest or guarantor”;
- keep the existing formal credit flow but relabel it clearly;
- after success, open the invoice/account for immediate printing.

A mixed tax basket should create two invoices and two accounts atomically,
matching the existing physical invoice-book behavior, with a clear success
message.

### 3. Payments and account screens

Add:

- `src/app/(app)/open-accounts/actions.ts`;
- `src/app/(app)/open-accounts/page.tsx`;
- `src/app/(app)/open-accounts/[id]/page.tsx`;
- `src/components/record-open-account-payment.tsx`;
- an Open Accounts/Customer Balances navigation entry in
  `src/components/app-shell.tsx` and the command palette.

The list should support search and Active/Overdue/Settled filters and show
customer, invoice, opened/due date, total, collected, and outstanding. The
detail should show the invoice, balance, optional due date, payment form,
payment history, recording user, and reminder action.

`recordOpenAccountPayment` must use the existing formal payment safety pattern:

- allowlist CASH/BANK/CHEQUE/CARD, validate amount/date/note, and authenticate;
- in a Serializable transaction load the authoritative account and payments;
- reject voided/settled accounts and amount above outstanding;
- prevent recent duplicate submissions;
- create the payment, re-sum from database rows, update `Invoice.amountPaid`,
  set `Invoice.status`, and mark the account SETTLED when balance reaches zero;
- use `createdAt` for drawer/shift timing even when `paidDate` is backdated;
- revalidate account, invoice, customer, dashboard, report, reminder, and shift
  paths.

Do not add write-offs/settlement discounts to the MVP. If needed later, model an
explicit admin-only adjustment rather than disguising it as cash.

### 4. Invoice, print, and customer views

Update `src/app/(app)/invoices/page.tsx` and
`src/app/(app)/invoices/[id]/page.tsx`:

- use **PAY LATER** and UNPAID/PARTIAL/PAID badges;
- show original total, payments, balance, promised date, and payment history;
- add Record/View Payments action;
- print **PAY LATER INVOICE / ACCOUNT STATEMENT** on A4 and thermal layouts;
- never show interest, grace-period, or guarantor language for this type.

Update customer list/detail/statement pages:

- show Pay Later and Formal Credit balances separately;
- show a combined receivable total prominently;
- add a Pay Later invoice table;
- print separate sections plus a unified dated payment history.

### 5. Accounting and operational integrations

These updates are required before shipping, not optional cleanup:

- `src/app/(app)/shift-report/actions.ts`: opening an unpaid account adds zero
  cash; add later CASH `OpenAccountPayment` rows by their `createdAt` and expose
  a separate collection subtotal.
- `src/app/(app)/reports/page.tsx`: revenue/COGS already belong on invoice date;
  add Pay Later issued/collected/outstanding metrics and include its real
  payments in realized-gross-profit calculations. Never include it in interest
  income.
- `src/app/(app)/dashboard/page.tsx`: show Cash / Pay Later / Formal Credit sale
  mix, open-account receivables, and combined collections today.
- `src/app/(app)/returns/actions.ts`: when an account is active, restock and
  apply the return against its balance atomically using a non-cash `RETURN`
  ledger entry; exclude that entry from cash and realized-collection totals.
  For MVP, reject a return whose value exceeds the outstanding balance until
  the cash/store-credit rule is explicitly defined.
- `src/lib/invoice-void.ts`: block void after any payment/return/service/closed
  shift activity; otherwise mark invoice and account VOIDED and restore stock
  without deleting the audit trail.
- `src/lib/reminders.ts` and `src/app/(app)/reminders/page.tsx`: separate Pay
  Later reminders with no interest wording. Dated accounts can notify near/after
  due date; undated accounts default to manual reminder only.
- `src/app/api/export/invoices/route.ts`: retain the new type and add a Balance
  column plus friendly labels if CSV compatibility permits.
- audit all two-way `InvoiceType` assumptions and make CASH/CREDIT/OPEN_ACCOUNT
  handling explicit.

### 6. Next.js 16 constraints

Before coding, follow the installed documentation in `node_modules/next/dist/docs`:

- keep mutations in module-level `"use server"` action files;
- authenticate/authorize and validate inside every directly invokable action;
- keep database reads in Server Component pages and interactive checkout/forms
  in narrow Client Components;
- call `revalidatePath` from the Server Action for every affected screen;
- treat `params` and `searchParams` page props as Promises.

## Verification

Unit tests:

- zero/partial/exact payment, due/overdue/settled states;
- overpayment and duplicate rejection;
- `RETURN` credit affects balance but never cash collected;
- friendly type/status labels and reminder classification;
- realized-profit movement from Pay Later collections.

Database integration tests:

- invoice + account + items + stock movement commit atomically;
- mixed tax basket creates two accounts with correct discount allocation;
- stock conflict rolls back every row;
- concurrent payments cannot overpay or lose an update;
- return reduces balance and restocks atomically;
- untouched void restores stock; payment/return/closed-shift void is blocked;
- shift cash includes only real cash received at recording time;
- existing cash and formal-credit behavior remains unchanged.

Manual acceptance:

- run Cash, Pay Later, and Formal Credit from the same cart;
- verify customer requirement and role restriction;
- print both A4 and 80mm invoices before and after payment;
- reconcile account, customer statement, invoice, dashboard, shift, CSV, and
  report totals;
- verify the non-taxable kill-switch hides the new records consistently.

Run `npx prisma validate`, generate the client, `npm test`, `npm run lint`, and
`npm run build`. Deploy the additive migration before deploying code that uses
the new tables.

## Recommended defaults requiring business confirmation

- creation permission: ADMIN/STAFF, not SALESPERSON;
- promised date: optional;
- partial payments: allowed;
- undated SMS: manual only;
- write-offs: unavailable in MVP;
- returns above balance: blocked in MVP;
- mixed tax basket: split into two Pay Later invoices/accounts.
