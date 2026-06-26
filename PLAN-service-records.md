# PLAN — After-Sales Service & Warranty Records

## Goal

Add an internal-only **Service Jobs** module so the shop can record every after-sale
service / warranty repair (e.g. a refrigerator brought in for repair), track its
status, and keep dated evidence of what was done — so a customer can't claim "nothing
was done" without basis. Staff can look up any job and see: is it Pending, In Progress,
or Completed, when, by whom, with photos and notes.

This is a standard CRUD module that **mirrors the existing `returns` / `customers`
features** (Server Actions + `useActionState` forms + list/detail/new/edit pages).

### Scope (confirmed with user)
- **No money/accounting.** Any cost goes in a free-text **notes** field. No charge amount, no link to invoices/revenue.
- **Customer link is optional.** Pick an existing customer, OR type a walk-in name + phone inline.
- **Photos: yes.** Reuse the existing upload + "scan with phone" flow for item photos (evidence).
- **Status: PENDING → IN_PROGRESS → COMPLETED** (+ a terminal **CANCELLED** for dropped jobs).
- Keep a **dated event timeline** per job (created / status change / note) — this is the core "proof" requirement.

---

## Data model (`prisma/schema.prisma`)

Additive only → apply with **`npm run db:push`** (NOT `migrate dev` — see migration-drift warning below).

```prisma
enum ServiceJobStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum ServiceEventType {
  CREATED
  STATUS_CHANGE
  NOTE
}

model ServiceJob {
  id            String           @id @default(cuid())
  jobNumber     String           @unique           // SVC-000001
  status        ServiceJobStatus @default(PENDING)

  itemName      String                             // e.g. "Refrigerator"
  brand         String?                            // brand / model
  serialNumber  String?
  underWarranty Boolean          @default(false)   // warranty repair vs paid job
  issue         String                             // reported problem / requested work
  resolution    String?                            // what was done (filled on completion)
  notes         String?                            // free text, incl. any cost notes
  photoKeys     String[]         @default([])      // storage keys (reuses /api/files)

  // optional customer link; falls back to inline contact for walk-ins
  customer      Customer?        @relation(fields: [customerId], references: [id])
  customerId    String?
  contactName   String?
  contactPhone  String?

  // optional link back to the original sale
  invoice       Invoice?         @relation(fields: [invoiceId], references: [id])
  invoiceId     String?

  createdBy       User?          @relation(fields: [createdByUserId], references: [id])
  createdByUserId String?
  completedAt   DateTime?
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt

  events        ServiceJobEvent[]

  @@index([status])
  @@index([customerId])
  @@index([createdAt])
}

model ServiceJobEvent {
  id           String            @id @default(cuid())
  job          ServiceJob        @relation(fields: [serviceJobId], references: [id], onDelete: Cascade)
  serviceJobId String
  type         ServiceEventType
  status       ServiceJobStatus?                   // snapshot for STATUS_CHANGE
  note         String?
  createdBy       User?          @relation(fields: [createdByUserId], references: [id])
  createdByUserId String?
  createdAt    DateTime          @default(now())

  @@index([serviceJobId])
}
```

**Back-relations to add to existing models** (additive):
- `Customer` → `serviceJobs ServiceJob[]`
- `Invoice` → `serviceJobs ServiceJob[]`
- `User` → `serviceJobs ServiceJob[]` and `serviceJobEvents ServiceJobEvent[]`

Notes:
- `photoKeys String[]` is a Postgres scalar list — supported by `db push`.
- `ServiceJobEvent` (cascade-deleted with the job) gives the dated audit timeline — directly serves the "prove it was done / when / by whom" requirement, mirroring the `StockMovement` history pattern.

---

## Files to create

### Lib
- **`src/lib/service-job-number.ts`** — `generateServiceJobNumber(tx)`, copy of `src/lib/invoice-number.ts`:
  ```ts
  export async function generateServiceJobNumber(tx: Prisma.TransactionClient): Promise<string> {
    const count = await tx.serviceJob.count();
    return `SVC-${String(count + 1).padStart(6, "0")}`;
  }
  ```
  Call inside the create transaction; retry on `P2002` like `createCashInvoice` does.

### Route module `src/app/(app)/services/`
- **`actions.ts`** (`"use server"`) — mirror `returns/actions.ts` + `customers/actions.ts`:
  - `createServiceJob(prev, formData)` — zod-validate; in a `$transaction`: generate `jobNumber`, create the job, create the initial `ServiceJobEvent { type: CREATED }`; `revalidatePath("/services")`; `redirect("/services/<id>?new=1")`. Retry loop on `P2002`.
  - `updateServiceJob(id, prev, formData)` — edit item/issue/contact/notes/photos.
  - `updateServiceJobStatus(id, status, note?)` — set status (set `completedAt` when COMPLETED), append `STATUS_CHANGE` event; `revalidatePath`.
  - `addServiceJobNote(id, note)` — append a `NOTE` event.
  - `deleteServiceJob(id)` — delete (events cascade); `redirect("/services")`.
  - Capture `session?.id` via `getSession()` for `createdByUserId` on job + every event (defense-in-depth: early-return an error if `!session`).
- **`page.tsx`** — list. Stat cards (`StatCard`): Open (PENDING+IN_PROGRESS), In progress, Completed this month (use `businessStartOfMonth` from `src/lib/dates.ts`). Search box (`?q=` over jobNumber / itemName / contactName / customer name+phone), status filter (`?status=`). Table: Job#, Item, Customer/Contact, Status `<Badge>`, Created. Header actions: **Export** (`<a href="/api/export/services">`, `buttonVariants({variant:"outline"})`) + **New service job** (`<Button>`). Mirror `customers/page.tsx` + `credit/page.tsx`.
- **`new/page.tsx`** — renders `<ServiceJobForm action={createServiceJob} submitLabel="Create service job" />`.
- **`[id]/page.tsx`** — detail: `?new=1` success banner; item info + `underWarranty` badge; customer link (or inline contact); **photo gallery** (`<img src={"/api/files/" + key}>`); **status control** (small form posting `updateServiceJobStatus`); **add-note** box (`addServiceJobNote`); **event timeline** (newest-first, with date via `toLocaleString`, actor name, status); Edit + `DeleteButton`. Mirror `credit/[id]/page.tsx` + `customers/[id]/page.tsx`.
- **`[id]/edit/page.tsx`** — `<ServiceJobForm action={updateServiceJob.bind(null, id)} initial={...} submitLabel="Save" />`.

### Components
- **`src/components/service-job-form.tsx`** (`"use client"`, `useActionState`) — fields: Item name*, Brand/model, Serial, **Under-warranty** checkbox, Issue* (textarea), Notes (textarea), **Customer**, **Photos**. Error banner + Cancel button exactly like `customer-form.tsx`.
  - **Customer picker:** reuse the customer-search approach from `src/components/new-sale.tsx` (search existing customer by name/phone → sets hidden `customerId`). When none selected, show **walk-in** `contactName` / `contactPhone` inputs. Keep it lightweight; both paths submit via the same FormData.
- **`src/components/service-photos.tsx`** (`"use client"`) — multi-photo uploader. Holds a `string[]` of keys in state; renders thumbnails (`/api/files/<key>`) with remove; "Add photo" POSTs to existing **`/api/upload`** (folder `"service"`); "Scan with phone" reuses **`/api/scan-ticket` + `/api/scan-upload`** + `qrcode` (lift the logic from `src/components/nic-upload.tsx`). Serializes keys into a single hidden input (comma-separated); the action splits to `photoKeys`. **No backend upload changes needed.**

### API
- **`src/app/api/export/services/route.ts`** — `force-dynamic`, in-handler `getSession()` 401 guard; columns: Job#, Date, Status, Item, Brand, Serial, Under warranty, Customer/Contact, Phone, Issue, Notes, Created by; `csvResponse(...)`. Mirror `src/app/api/export/customers/route.ts`.

## Files to modify
- **`src/components/app-shell.tsx`** — import a `lucide-react` icon (`Wrench`); add `{ href: "/services", label: "Service Jobs", icon: Wrench }` to the **Sales** `NavGroup` (after Returns). `isActive` already handles highlight.
- **`prisma/schema.prisma`** — add the two models, two enums, and the back-relations above.
- *(Optional, nice-to-have)* **`src/app/(app)/dashboard/page.tsx`** — add an "Open service jobs" `StatCard` linking to `/services`.

---

## Status → Badge tones
```ts
const serviceStatusTone = {
  PENDING: "amber",
  IN_PROGRESS: "blue",
  COMPLETED: "green",
  CANCELLED: "gray",
} as const;
// <Badge tone={serviceStatusTone[job.status]}>{job.status.replace("_"," ")}</Badge>
```

---

## Implementation order
1. Schema: add enums + models + back-relations → `npm run db:push` → **restart dev server** (loads new Prisma client).
2. `src/lib/service-job-number.ts`.
3. `services/actions.ts` (create/update/status/note/delete).
4. `service-job-form.tsx` + `service-photos.tsx`.
5. Pages: `new` → `[id]` (detail + timeline + status/note controls) → `page.tsx` (list) → `[id]/edit`.
6. Nav link in `app-shell.tsx`.
7. CSV export route.
8. *(Optional)* dashboard stat.

---

## Verification (end-to-end)

Static:
```bash
npx tsc --noEmit      # clean
npm run lint          # no NEW errors (repo has known pre-existing ones)
npm test              # existing 15 tests still pass
npm run build         # prisma generate + next build clean
```

Manual (dev: `npm run dev`, login `admin@madagama.lk` / `admin123`):
1. **Create** a service job for "Refrigerator", walk-in contact (name + phone, no customer) → redirects to detail with success banner; job# `SVC-000001`; timeline shows a CREATED event with your name + date.
2. **Photo**: add a photo via "Add photo" (and verify "Scan with phone" QR renders) → thumbnail shows, persists after save, loads via `/api/files/...`.
3. **Status**: move PENDING → IN_PROGRESS → COMPLETED → each appends a dated STATUS_CHANGE event; `completedAt` set; list **status filter** + **search** by job#/item/phone work; stat cards update.
4. **Customer link** variant: create a job linked to an existing customer → name/phone shown from the customer record.
5. **Add note** (e.g. "Charged Rs.3,500, gas refill") → appears in timeline.
6. **Edit** then **Delete** a job → events cascade; list refreshes.
7. **Export** `/api/export/services` downloads a CSV (opens cleanly in Excel; BOM present).
8. Nav: "Service Jobs" appears in the Sales group and highlights when active.

---

## Notes / gotchas
- **Migration drift:** use **`npm run db:push`**, never `prisma migrate dev` / `prisma db pull` (would offer a data-wiping reset / rewrite the schema). After push, **restart the dev server**.
- **Prod (Vercel):** photo uploads require `STORAGE_DRIVER=s3` (Backblaze B2 already configured locally per project memory) — the local-disk driver throws on Vercel. "Scan with phone" needs HTTPS (works on Vercel preview/prod, not bare localhost from a separate phone).
- **Timezone:** any day/month bucketing (stat cards, "completed this month") must use `src/lib/dates.ts` helpers (`businessStartOfMonth`, `businessDayKey`) — never raw `Date` math, to stay correct in UTC on Vercel.
- **Money fields:** intentionally omitted (cost lives in `notes`) per the user's choice; can be added later without breaking anything.
- **Access:** the whole `(app)` group already requires login via `layout.tsx`; staff (not just admin) handle services, so no `requireAdmin` gating — just a `getSession()` presence check in actions.

---

## Critical reference files (patterns to copy)
- Actions + tx + retry: `src/app/(app)/returns/actions.ts`, `src/app/(app)/invoices/actions.ts`
- Form + `useActionState`: `src/components/customer-form.tsx`
- List / detail pages: `src/app/(app)/customers/page.tsx`, `src/app/(app)/credit/[id]/page.tsx`
- Number generator: `src/lib/invoice-number.ts`
- Photo upload + scan-with-phone: `src/components/nic-upload.tsx`, `src/app/api/upload/route.ts`, `src/app/api/scan-ticket/route.ts`, `src/app/api/scan-upload/route.ts`, `src/app/api/files/[...key]/route.ts`
- CSV export: `src/lib/csv.ts`, `src/app/api/export/customers/route.ts`
- UI kit + badge/stat: `src/components/ui/*`, `src/components/page-header.tsx`, `src/components/stat-card.tsx`
- Nav: `src/components/app-shell.tsx`
- Dates: `src/lib/dates.ts`
