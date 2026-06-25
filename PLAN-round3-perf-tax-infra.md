# Round-3 Plan — Speed, Non-taxable Kill-Switch, Backups & Production Hardening

_Created 2026-06-25. Status: not deployed yet (dev only). Hosting stays **Vercel + Neon**; AWS used only for S3 + the backup story. Backups go to **Google Drive**. The non-taxable switch is **hide-only / fully reversible — never deletes data**._

> ⚠️ Before writing code: per `AGENTS.md`, this is Next.js 16 with breaking changes. Read the relevant guides in `node_modules/next/dist/docs/` first — especially **caching/`revalidate`**, **`proxy` vs `middleware`**, and the **dev/Turbopack** flag. Don't assume training-data behavior.
>
> ⚠️ **Do NOT run `prisma migrate dev` / `npm run db:migrate`** — the live Neon DB has migration drift and `migrate dev` will offer to RESET (wipe data). All schema changes in this plan use **`npm run db:push`** (additive). Fixing the drift properly is a dedicated task in Workstream 4.

---

## Workstream 1 — SPEED (top priority)

The app is dev-only, but every query still goes to **remote Neon** (cold starts up to 5s) and `next dev` recompiles routes. Fixes below help both dev now and production later. Ordered by impact-per-effort.

> **STATUS (2026-06-25): code batch DONE & verified** — tsc clean, 15 tests pass, build clean, 4 pre-existing lint errors (zero new). Done: Prisma singleton kept warm in all envs; new `src/lib/settings.ts` `getSettings()` (React `cache`); layout parallelized via `Promise.all`; dashboard week-items → `groupBy`; **8 new indexes applied to Neon via `db push`**. Confirmed during this work: **Turbopack is already the default** `next dev` bundler (no flag needed); **route-segment caching is a no-op in dev** and the layout's `cookies()` forces dynamic rendering, so item 1.4 was **dropped** as a dev-time optimization (revisit only as a prod `unstable_cache` task — mind Decimal serialization); **`proxy.ts` is the correct Next 16 convention** (Middleware was renamed to Proxy) and the build confirms `ƒ Proxy (Middleware)` is active, so 4.1 is NOT an open hole (auth + `/api` 401s run).
>
> 🔴 **BIGGEST REMAINING SPEED LEVER — DB region.** The Neon project is in **`us-west-2` (Oregon, USA)** while the shop/users are in **Sri Lanka** → ~250–300 ms per query round-trip, plus cold starts. This dominates everything the code can do. Fix: move the database to **`ap-southeast-1` (Singapore)** — the closest Neon region — and, at deploy time, pin Vercel functions to Singapore (`sin1`) too. Since not live yet, this is a clean dump→restore into a new Neon project + swap `DATABASE_URL`/`DIRECT_URL`. Also check Neon autosuspend (scale-to-zero) which causes the cold-start lag. **Awaiting user go-ahead.**

### 1.1 Parallelize + cache the per-request setting read
- `src/app/(app)/layout.tsx:6-7` runs `requireUser()` then `prisma.setting.findUnique()` **sequentially** on every page. Parallelize with `Promise.all`.
- Create `src/lib/settings.ts` exporting `getSettings()` wrapped in React `cache()` (dedupes within a render). Use it in the layout and everywhere that currently calls `prisma.setting.findUnique({ where: { id: 1 } })` (e.g. `settings/page.tsx:14`). This also becomes the single source for the non-taxable flag (Workstream 2).

### 1.2 Push aggregations into the DB (stop fetching rows to sum in JS)
- **Dashboard** `src/app/(app)/dashboard/page.tsx:89-96`: two unbounded `invoiceItem.findMany` (today COGS + week revenue map) summed in JS. Replace with `prisma.invoiceItem.aggregate` (COGS) and `prisma.invoiceItem.groupBy({ by: ["nameSnapshot"], _sum })` (top sellers).
- **Reports** `src/app/(app)/reports/page.tsx:53`: fetches **all invoices for 12 months** into memory, looped twice (lines ~116-135). Replace with two `groupBy` (daily + monthly buckets). Keep using `src/lib/dates.ts` keys so buckets stay Asia/Colombo-correct.
- **Reports** `reports/page.tsx:80-83`: fetches all active products to compute stock value in JS → use `prisma.product.aggregate`.
- **Credit list** `src/app/(app)/credit/page.tsx:17-25`: `include: { payments: true }` hydrates every payment for up to 300 agreements. Narrow to `payments: { select: { amount: true, paidDate: true } }` (detail page keeps full history).

### 1.3 Add missing indexes (apply with `db push`)
In `prisma/schema.prisma`, add:
- `Invoice`: `@@index([taxCategory])`, `@@index([status])`, `@@index([soldByEmployeeId])`, `@@index([createdByUserId])` (already has `createdAt`, `customerId`).
- `Payment`: `@@index([paidDate])`.
- `CreditAgreement`: `@@index([customerId])`.
- `PurchaseItem`: `@@index([purchaseId])`, `@@index([productId])`.
These back the `groupBy`/`where` clauses on dashboard & reports.

### 1.4 Stop `force-dynamic` on slow-changing pages
Every page sets `export const dynamic = "force-dynamic"`, disabling all caching. Mutations already call `revalidatePath`, so switch infrequently-changing lists (products, customers, suppliers, employees, settings) to `export const revalidate = 30` (confirm the exact API in the bundled Next 16 docs first). Leave dashboard/POS/invoices/credit dynamic.

### 1.5 Prisma client + dev compile
- `src/lib/prisma.ts:11`: the singleton is only cached when `NODE_ENV !== "production"`, so production opens a fresh connection per render. Change to set `globalForPrisma.prisma = prisma` **unconditionally** (safe in all envs).
- Dev: run with **Turbopack** (verify the exact flag in this Next version's docs; likely `next dev --turbopack`) and add it to the `dev` script. Benchmark real speed with `next build && next start` — `next dev` is always slower.
- _Optional, when deploying:_ evaluate the Neon serverless driver adapter (`@prisma/adapter-neon` + `previewFeatures = ["driverAdapters"]`) to cut TCP cold-start cost on Vercel. Defer — bigger change, lower immediate payoff.

**Critical files:** `layout.tsx`, `lib/prisma.ts`, new `lib/settings.ts`, `dashboard/page.tsx`, `reports/page.tsx`, `credit/page.tsx`, `prisma/schema.prisma`, `package.json`.

---

## Workstream 2 — Non-taxable kill-switch (hide-only, reversible)

Add one admin toggle that makes the whole system behave as if only taxable products/invoices exist. **No data is deleted**; flipping it back restores everything. Default ON (`true`) so current behavior is preserved.

> **STATUS (2026-06-25): DONE & verified** — tsc clean, 15 tests pass, build compiles clean, only the 4 pre-existing lint errors (zero new). Implemented:
> - `Setting.nonTaxableEnabled Boolean @default(true)` pushed to the **Singapore** DB via `db push`; existing row defaulted to `true` (current behavior preserved).
> - New `src/lib/tax-mode.ts`: `nonTaxableEnabled()` (reads cached `getSettings()` — no extra round-trip), `productTaxableWhere()`, `invoiceTaxableWhere()`.
> - **Settings toggle** (`settings/actions.ts` admin-guarded write so a non-admin's missing checkbox can't flip it; `settings-form.tsx` "Tax mode" card gated on `isAdmin`; `settings/page.tsx` passes `isAdmin` + initial).
> - **Creation blocked when off**: product create/update force `taxable=true` + checkbox hidden; `createCashInvoice` rejects NT; `createCreditSale` rejects NT.
> - **Reads hidden when off**: product search, products list (+Tax column), product detail (404 NT + hide row), invoices list (+Category column/tabs), invoice detail (404 NT + hide badge), dashboard (all sales aggregates + low-stock + Book column), reports (all aggregates + NT stat card + stock), both CSV exports (filter rows + drop columns).
> - **POS/credit UI**: `nonTaxableEnabled` threaded into `new-sale.tsx` (split notices, "(non-taxable)" hints, result badge) and `credit-sale.tsx` (bill-type badge).
>
> ⚠️ A `prisma db pull` run during the DB migration silently rewrote the schema (stripped comments, reordered fields) — restored the documented version before adding the flag. Don't run `db pull` against this project; it clobbers the hand-written schema.
> ⚠️ **Restart the dev server** to load the new Prisma client + the Singapore `.env`.

### 2.1 Flag + helpers
- `prisma/schema.prisma` `Setting` (after line 54): `nonTaxableEnabled Boolean @default(true)`. Apply via `db push`.
- Surface it through `getSettings()` (Workstream 1.1).
- New `src/lib/tax-mode.ts` with filter helpers used at every read site:
  - `productTaxableWhere(enabled)` → `enabled ? {} : { taxable: true }`
  - `invoiceTaxableWhere(enabled)` → `enabled ? {} : { taxCategory: "TAXABLE" }`

### 2.2 Block creation of non-taxable records (when disabled)
- `src/components/product-form.tsx:185-193`: hide the taxable checkbox; `src/app/(app)/products/actions.ts` (`createProduct` ~46/66, `updateProduct` ~97/114) force `taxable = true`.
- `src/app/(app)/invoices/actions.ts:67-96` (`createCashInvoice`): product search already returns only taxable items (2.3), so carts can't hold NT items; add a server-side guard that coerces everything into the single TAXABLE group / rejects NT.
- `src/app/(app)/credit/actions.ts:93-102` (`createCreditSale`): reject `NON_TAXABLE`.

### 2.3 Hide non-taxable from all reads / UI
- Product search API `src/app/api/products/search/route.ts:21,31`: apply `productTaxableWhere` so the POS/credit pickers never surface NT products.
- Products list `products/page.tsx` + detail `products/[id]/page.tsx`: filter list with `productTaxableWhere`; hide the "Non-taxable" badge/label.
- Invoices list `invoices/page.tsx:18-22,31,35,100-115,151-152`: drop the "Non-taxable" filter tab + Category column, and apply `invoiceTaxableWhere` to the query.
- Invoice detail `invoices/[id]/page.tsx:75-76`: `notFound()` if the invoice is NT and the flag is off (no direct-URL traces); otherwise hide the category badge.
- Dashboard `dashboard/page.tsx:61-65,111-112,526-527`: filter the `groupBy(taxCategory)` + recent-invoices query; don't render NT figures/badges.
- Reports `reports/page.tsx:61-65,111-112,175-176`: filter the query; hide the "Non-taxable sales (month)" stat card; show taxable totals only.
- CSV exports `api/export/invoices/route.ts:19,24` and `api/export/stock/route.ts:15,31`: filter rows with the helpers and drop the Category/Taxable columns when disabled.

### 2.4 POS / credit UI cleanup (when disabled)
Pass `nonTaxableEnabled` into `src/components/new-sale.tsx` (lines 296-300, 365, 374-375, 437, 512, 600-610, 671-674) and `src/components/credit-sale.tsx` (182-185, 389-390, 423-425): hide split-bill notices, "(non-taxable)" hints, TX/NT badges, and the mixed-cart logic.

### 2.5 Settings toggle (admin-only)
Wire the flag through the existing settings pipeline: `settings/actions.ts` (Zod + `formData.get("nonTaxableEnabled") === "on"` + write), `components/settings-form.tsx` (checkbox mirroring `smsEnabled`), `settings/page.tsx` (pass `initial`). Render the toggle **only for `role === "ADMIN"`** and enforce admin in the action (reuse the `ensureAdmin()` pattern from `settings/users-actions.ts:13-17`).

**Master surface list:** see the categorized checklist already produced — groups (A) data-entry, (B) display/lists, (C) reports/aggregations, (D) nav/filters. Every item above maps to it.

---

## Workstream 3 — Daily database backups to Google Drive

Vercel serverless can't run `pg_dump`, so backups run **outside the app** (also satisfies "without affecting the running system"). Use a scheduled **GitHub Action**.

### 3.1 Mechanism
- New `.github/workflows/db-backup.yml`, cron daily at a low-traffic hour (e.g. `30 19 * * *` UTC = 01:00 Asia/Colombo) + `workflow_dispatch` for manual runs.
- Steps: `pg_dump "$DIRECT_URL"` (the **non-pooled** `DIRECT_URL` — pooled URL breaks `pg_dump`) → `gzip` → upload to Google Drive via **`rclone`** (service-account remote) into a dated path `madagama-backups/YYYY/madagama-YYYY-MM-DD.sql.gz`.
- Retention: `rclone delete --min-age 30d` (or keep 30 daily + a monthly).

### 3.2 One-time Google setup
1. Google Cloud project → enable **Drive API** → create a **service account** → JSON key.
2. Create a Drive folder, **share it with the service-account email** (Editor).
3. Build an `rclone` config for the service account; store the whole rclone config + `DIRECT_URL` as **GitHub repo secrets** (`RCLONE_CONFIG`, `DIRECT_URL`).
4. Trigger the workflow manually once to verify a dump lands in Drive.

### 3.3 Restore runbook (document in README)
Download the `.gz`, `gunzip`, then `psql`/`pg_restore` into a **fresh Neon branch** first (never straight into prod), verify, then promote. Keep this written down — an untested backup isn't a backup.

### 3.4 Second safety layer (free, just verify)
Neon has built-in **point-in-time restore**. Confirm the retention window in the Neon dashboard. Net result: platform PITR + off-platform Google Drive dumps = two independent recovery paths.

---

## Workstream 4 — Production hardening (do before go-live)

Stays on Vercel + Neon; AWS credit funds S3.

### 4.1 ⚠️ Verify API auth (possible security hole)
Memory says `/api/export/*` is protected by `proxy.ts` middleware, but research found **no middleware actually running** (`middleware-manifest.json` empty) — meaning the export routes (full customer/invoice/stock dumps) may be **publicly reachable**. Check whether Next 16 uses `proxy.ts` or `middleware.ts` (consult the bundled docs — the filename may itself be the bug), confirm it executes, and ensure every `/api/*` (except `/api/cron/*` and `/api/auth/login`) requires a session. Add an auth check inside the export routes as a belt-and-braces guard regardless.

### 4.2 Move file storage to AWS S3 (NIC uploads)
Vercel's filesystem is ephemeral, so the local-disk uploads won't survive in prod. The S3 driver already exists in `src/lib/storage.ts`. Create a private S3 bucket + least-privilege IAM user (the AWS credit easily covers S3 pennies), then set `STORAGE_DRIVER=s3` + `S3_REGION/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY/S3_PUBLIC_URL` in Vercel. NIC images stay served through the authed `/api/files/[...key]` route.

### 4.3 Zero-downtime updates
- Vercel deploys are **atomic + instant rollback** out of the box — that's the core requirement met.
- Use **Preview Deployments**: every branch/PR gets its own URL. Optionally point previews at a **Neon branch** (a copy-on-write clone of prod) so schema/data changes are tested against real-shaped data without touching prod.
- Workflow: feature branch → preview + Neon branch → verify → merge to `main` → Vercel auto-promotes.

### 4.4 Fix migration drift so future schema changes are safe
Today schema changes need `db push` because migration history is broken (`prisma/migrations` doesn't match the live DB). For a production system this must be fixed so future changes are **versioned and applied via `prisma migrate deploy` in the Vercel build** (additive, zero-downtime). Plan: on a **Neon branch** (never prod first), baseline the history — generate an init migration matching the current DB and `prisma migrate resolve --applied`, confirm `migrate status` shows no drift — then switch the build to `prisma generate && prisma migrate deploy && next build`. This is delicate; do it as its own task with a backup taken first (Workstream 3).

### 4.5 Uptime monitoring
Add a lightweight `src/app/api/health/route.ts` (returns 200 + a trivial `SELECT 1`). Point a free monitor (UptimeRobot / Better Stack) at it with email/SMS alerts. Vercel + Neon already clear 99% comfortably; this just tells you when something breaks.

---

## Suggested sequence
1. **Workstream 1** (speed) — immediate, low-risk wins. _(your top priority)_
2. **Workstream 2** (non-taxable switch) — self-contained feature.
3. **Workstream 3** (Google Drive backups) — get data safety in place.
4. **Workstream 4** (hardening) — right before deploying for real.

## Verification
- **Speed:** `npm run build && npm run start`; click dashboard/reports/invoices/credit. Confirm via Neon's query insights (or temporary timing logs) that dashboard/reports issue `aggregate`/`groupBy` instead of bulk row fetches, and that the layout's two awaits run in parallel. Re-check `npm run dev` (with Turbopack) feels faster.
- **Non-taxable OFF:** flip the Settings toggle. Verify: products list/search show only taxable; POS & credit can't add NT items and show no split UI; invoices list has no Category column/tab and lists only TX; an old NT invoice URL 404s; dashboard/reports show taxable-only totals; CSV exports omit NT rows. Flip **back ON** → everything reappears (proves nothing was deleted). Confirm a non-admin user can't see/change the toggle.
- **Backups:** manually dispatch the GitHub Action; confirm a dated `.sql.gz` appears in the Drive folder; do a test restore into a throwaway Neon branch and `SELECT count(*)` a few tables.
- **Tests/lint:** `npm test` (15 should still pass) and `npm run lint` stay clean. Apply all schema changes with `npm run db:push` (never `migrate dev`), then **restart the dev server** to reload the Prisma client.
- **Security:** with no session cookie, `curl` the `/api/export/*` routes → must be 401, not a data dump.
