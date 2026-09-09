# Database backups

Automated, self-hosted, and free — built as a Railway-Pro-plan alternative
until managed backups are actually in budget.

## How it works

- Once an hour, `startBackupScheduler` (`src/services/scheduler.js`) checks
  whether a successful backup has landed in the last 20 hours. If not, it
  runs one. This hourly-recheck shape (not a single once-a-day timer) is
  deliberate — it survives a redeploy or restart landing at exactly the
  wrong moment, and it can never silently stop running after a deploy the
  way a one-shot `cron`-style timer could.
- Each run (`src/services/backup.js`):
  1. `pg_dump $DATABASE_URL --no-owner --no-privileges --clean --if-exists`
  2. gzips the result
  3. uploads it to Cloudflare R2 as `backups/xean-YYYY-MM-DD.sql.gz`
  4. deletes any backup beyond the most recent 7
  5. records the outcome — success or failure — as a row in `backup_runs`
- **Backups are never a silent process.** Every attempt, including
  failures, gets its own row. See "Checking backup health" below.

## Why R2, not Cloudinary (already used elsewhere in this app)

Cloudinary is already integrated, but it's a media/image CDN with
transformation-based billing, and its free-tier storage and bandwidth are
already spent on real customer uploads (leases, receipts, chat
attachments, logos). Routing daily DB backups through that same quota
risks the *actual* document-upload feature hitting a cap because of
backup accumulation, not because customers uploaded more documents.

R2 was chosen over Backblaze B2 (the other realistic free option)
specifically for **zero egress fees, forever** — a restore or a backup
download never has a cost concern, where B2's free egress is capped at
1 GB/day. Both offer 10 GB free storage. At ~12 MB per full database dump
(compressing to a few MB gzipped), the free tier has enormous headroom —
this should cost $0/month for a very long time.

## Environment variables required

```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
```

The R2 API token should be scoped to only this one bucket, read/write —
never a full-account token. The bucket should be private (not public);
R2 encrypts data at rest by default, which is treated as sufficient here —
no additional client-side encryption is applied to the dump itself.

## Checking backup health

Owners can see backup history (timestamp, status, file size) on the
dashboard's Language/Settings page, under "Database backups" — this
exists specifically so a silent failure would actually be *noticed*
instead of sitting unread in Railway's logs. A `failed` status there
always comes with an `error_message` in the `backup_runs` row if you need
to dig further via direct DB access.

## Restoring from a backup

A backup that's never been tested to restore isn't fully trustworthy —
this exact procedure should be run end-to-end against a real scratch
database (never production) whenever the backup mechanism itself changes,
not just documented and assumed to still work.

1. Download and decompress the backup you want:
   ```
   cd backend
   npm run restore-backup -- latest        # most recent
   npm run restore-backup -- 2026-09-07    # a specific date
   ```
   This downloads the file from R2 and gunzips it to
   `restored-xean-<date>.sql` in the current directory. **It does not run
   the restore itself** — the next step is a genuinely destructive action
   and is left as a deliberate, manual command so this script can never
   accidentally fire against the wrong database.

2. Restore it against whichever database you actually intend:
   ```
   psql "<TARGET_DATABASE_URL>" < restored-xean-<date>.sql
   ```
   The dump includes `--clean --if-exists`, meaning it drops and recreates
   everything cleanly — safe to run against either an empty database or
   one that already has data in it (it will fully overwrite that data with
   the backup's contents).

   **Never run this against production's `DATABASE_URL` unless this is an
   actual disaster-recovery situation** — it replaces the entire live
   database with the backup's contents.

3. Verify: run `npm run migrate` afterward to confirm the schema is fully
   up to date relative to the current codebase (a backup taken before a
   later schema migration would otherwise be missing newer columns/tables).

## Retention

The 7 most recent successful backups are kept in R2; older ones are
deleted automatically after each new successful backup. `backup_runs`
history in the database itself is kept indefinitely (it's tiny metadata,
not the actual backup content) — useful as a longer audit trail even
after the corresponding R2 file has been pruned.
