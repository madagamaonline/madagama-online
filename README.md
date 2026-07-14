# Madagama Pvt Ltd — Retail & Credit Management System

A web app for a Sri Lankan retail business (agricultural tools/spares + electronics/parts)
with inventory, VAT invoicing, flexible-installment credit sales with interest, supplier-credit
purchasing, SMS reminders, payroll, expenses, and KPI reports.

**Stack:** Next.js 16 (App Router) · TypeScript · Prisma 6 · PostgreSQL (Neon) · Tailwind v4 ·
JWT cookie auth (jose) · text.lk SMS · recharts.

## Features

- **Catalog** — categories/subcategories with auto-generated codes (`AGR-TOOL-0001`), stock & low-stock alerts.
- **Cash sales** — fast POS billing, VAT-inclusive 18% (configurable), printable tax invoices, auto stock decrement.
- **Credit sales** — guarantor + NIC uploads, 4-month interest-free then 2%/month on the remaining balance (non-compounding), flexible payments, live balances, overdue tracking.
- **Suppliers & purchases** — stock-in (GRN), supplier credit with due dates and payments.
- **Customer requests** — track product/import inquiries from first note through searching, ordering, arrival, customer contact, and completion.
- **SMS reminders** — text.lk, sent by a daily Vercel cron (request follow-ups, customer dues + interest warnings, supplier credit alerts).
- **Payroll** — daily attendance, ad-hoc commissions, monthly salary sheets.
- **Finance** — expenses, profit report, daily/monthly sales-trend charts.
- **Settings** — business details, VAT %, interest rate & grace period, SMS config.

## Local development

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL / DIRECT_URL (and AUTH_SECRET, CRON_SECRET)
npm run db:migrate          # apply schema
npm run db:seed             # admin user + sample data
npm run dev
```

Open http://localhost:3000 — sign in with **admin@madagama.lk / admin123** (change this in production).

Run unit tests (interest engine + code generator): `npm test`.

## Environment variables

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | Pooled Postgres URL (app runtime) |
| `DIRECT_URL` | Direct Postgres URL (Prisma migrations) |
| `AUTH_SECRET` | JWT signing secret (`openssl rand -base64 32`) |
| `CRON_SECRET` | Protects `/api/cron/reminders` (`openssl rand -hex 24`) |
| `STORAGE_DRIVER` | `local` (dev) or `s3` (production) |
| `S3_REGION`/`S3_BUCKET`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` | NIC image storage when `STORAGE_DRIVER=s3` |
| `TEXTLK_API_TOKEN` | text.lk API token (SMS). When empty, reminders are logged but not sent. |
| `TEXTLK_SENDER_ID` | Approved sender ID |

## Deploy to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Set all environment variables above in the Vercel project.
   - **Important:** set `STORAGE_DRIVER=s3` and the `S3_*` vars — Vercel's filesystem is ephemeral, so the `local` driver would lose uploaded NIC images.
   - Set `CRON_SECRET`; Vercel automatically sends it as a Bearer token to the cron route.
3. The build runs `prisma generate && next build`. Apply migrations on deploy with `npm run db:deploy` (or set the build command to `prisma migrate deploy && prisma generate && next build`). The full schema lives in `prisma/migrations` — **do not run `prisma db push` against production**; it bypasses migration history and causes drift.
4. The daily reminder cron is configured in `vercel.json` (`/api/cron/reminders`, 03:00 UTC).

## Operations

- **Health check** — `GET /api/health` runs a trivial `SELECT 1` and returns `{ "status": "ok" }` (HTTP 200) or `{ "status": "error" }` (HTTP 503) if the database is unreachable. It's public (no session). Point an external monitor (UptimeRobot, Better Stack) at it for downtime alerts.
- **Off-site backups** — `.github/workflows/db-backup.yml` dumps the database nightly and uploads it to an rclone remote (e.g. Google Drive), independent of Neon's built-in PITR. It needs the `BACKUP_DATABASE_URL` and `RCLONE_CONF_BASE64` repository secrets (see the file header). Trigger a manual run from the Actions tab to verify before relying on it.

## Notes / follow-ups

- Net profit in Reports is approximate (uses current product cost for COGS; excludes credit interest income).
