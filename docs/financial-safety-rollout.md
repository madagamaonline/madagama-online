# Financial safety changes — rollout and verification

These changes were prepared and tested locally. On 2026-09-11, the user explicitly
authorized applying the additive migration and pushing the changes to main.

## Applied migration record

- Fresh backup: `madagama-20260911T100531Z.sql.gz` (175.1 KiB), uploaded to R2 by
  [backup run 34587460871](https://github.com/madagamaonline/madagama-online/actions/runs/34587460871).
- The live database had no failed migrations or historical checksum mismatches;
  only `20260911120000_financial_safety` was pending.
- The migration was validated on a disposable local PostgreSQL database, including
  legacy-row preservation and rejection of invalid refund splits.
- `prisma migrate deploy` applied the migration successfully. It runs inside an
  explicit transaction with a 5-second lock timeout and a 60-second statement timeout.
- All six existing SalesReturn records had matching before/after fingerprints of
  their original fields; both new columns are nullable and the new attempt table
  was empty immediately after migration.
- No reset, restore, backfill, or historical money correction was executed.

## Deployment dependency

The new Prisma client expects two nullable SalesReturn fields and the
AuthAttemptWindow table. The migration has now been applied to the configured live
database under explicit authorization. Other environments must apply it before
deploying this application version.

`20260911120000_financial_safety/migration.sql` only adds:

- Nullable `SalesReturn.cashRefund` and `balanceCredit` columns, with a constraint
  on newly captured splits. Existing rows retain NULL in both columns.
- An `AuthAttemptWindow` table for shared account-switch attempt limits.

It contains no drops, deletes, backfills, or changes to existing money values.
`npm run build` no longer runs `prisma migrate deploy`. Building and database
migration are separate operations. Do not use `db push` or reset commands.

For a future approved rollout:

1. Use a disposable staging database and independently configured storage/SMS
   settings. Apply migrations there and run the database integration tests there.
2. Verify partial/full customer returns, bill and product discounts, cash-plus-credit
   returns, duplicate supplier returns, backdated vehicle installments, parallel
   purchase entry, account switching and settings changes.
3. Confirm a current production backup and rehearse recovery on the disposable
   database. Plan a maintenance window. Stop customer/staff writes and cron jobs.
4. Apply the additive migration, then deploy the matching application and client.
   Verify before reopening writes. For the completed additive migration, see the applied migration record above.
5. If reverting application code, leave the additive schema in place. Do not drop
   the new columns: they contain the refund split captured by the new application.

## Historical data

Old receipts, payments, returns and account balances are preserved. NULL split fields
mean the old system did not record the split; they are not treated as known zero cash.
Reporting retains the old CASH/non-CASH classification for those records. The system
does not invent a cash payout for a historical CREDIT_BALANCE return.

Old over-refunds reduce the value available for further returns. Fully returned
quantities cannot be returned again. Supplier costs are derived from the purchase;
multiple lines for the same product are grouped using their combined recorded cost.
Historical inconsistencies require a separate reconciliation against actual receipts
and cashier records. No automatic correction is included.

## Account switching and credentials

Administrator switching requires the administrator's full password. Staff PINs keep
working, with at most five failed/in-flight attempts per target account per 15-minute
window, shared across server instances. Successful reservations are released without
resetting other attempts. Existing passwords and PIN records are not changed.

The stored SMS token is never returned to a browser. An empty replacement field keeps
it; removal requires an explicit admin checkbox. Environment-provided SMS credentials
are unaffected by removing the database override.

## Restore workflow

The workflow now validates/decompresses the selected dump before starting SQL, saves
and verifies an off-site pre-restore snapshot, and invokes `psql -X` with
`--single-transaction` and `ON_ERROR_STOP=1`. SQL failure rolls the restore back.
Backup and restore workflows share one concurrency group.

**A restore still intentionally replaces the database with an earlier snapshot.**
Pause the application and cron jobs first: workflow concurrency does not stop user
writes, and a snapshot cannot preserve writes committed after that snapshot begins.
Keep business writes paused through verification. Pre-restore recovery snapshots use
`pre-restore/` object keys and must be retained independently of routine backup cleanup.
They are recovery artifacts, not automatically selectable from the app's dated backup
list. Restore/reconcile them only through an approved recovery operation.

The restore shell was exercised with local command stand-ins, including corrupt dumps,
failed snapshots/uploads/checksum verification and SQL failure. This is not a real
PostgreSQL restore drill or verification of production backup configuration.

## Offline validation

The regression tests mock Prisma at its module boundary. Database integration suites
are skipped when `TEST_DATABASE_URL` is empty. Run offline tests with database URLs
explicitly set to a non-routable local placeholder:

```sh
TEST_DATABASE_URL= DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline DIRECT_URL=postgresql://offline:offline@127.0.0.1:1/offline npm test
npm run lint
./node_modules/.bin/tsc --noEmit --incremental false
```

No local production build or live browser walkthrough was run. Local Prisma client
generation used the same placeholder URLs; it generates
files without migrating or contacting a database.
