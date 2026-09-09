import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { unlink, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import pool from "../db.js";

const execFileAsync = promisify(execFile);

// R2 is fully S3-API-compatible -- same client the rest of the JS
// ecosystem uses for real AWS S3, just pointed at Cloudflare's endpoint
// with an account-scoped URL instead of an AWS region. See BACKUPS.md for
// why R2 was chosen (zero egress fees, 10GB free) over Cloudinary (already
// used in this app, but for media/documents -- commingling backups into
// that same quota risks the real document-upload feature hitting a cap).
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET = process.env.R2_BUCKET_NAME;
const BACKUP_PREFIX = "backups/";
const RETAIN_COUNT = 7;

// The base image's default apt repo only ships one fixed PostgreSQL client
// major version (verified directly: Debian trixie's default repo has only
// postgresql-client-17). pg_dump refuses to dump a server NEWER than
// itself as a real safety check (confirmed by hitting exactly this error
// against Railway's managed Postgres, which runs 18.x) -- it's not
// optional to work around, so this ensures a matching client exists before
// ever trying to dump.
//
// Self-healing at runtime rather than baked into the build image: this
// project builds with Railway's Railpack (confirmed directly -- no
// /nix/store, but /mise, on the container), which has no verified,
// low-risk way to pin a specific PostgreSQL client version at build time
// (nixpkgs has version-pinned packages, but that's the wrong builder
// entirely; Railpack's own mise-based equivalent compiles Postgres from
// source, an unverified and much heavier dependency). A manual one-off
// fix via SSH was also ruled out -- Railway rebuilds the container from
// scratch on every deploy, so anything installed by hand on a running
// container is discarded the moment the next deploy replaces it.
//
// This uses PostgreSQL's own official bootstrap script
// (/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh, already
// present in the base image, read directly from the container before
// relying on it) to add the repo, then installs the versioned client
// package with a plain `apt-get install` rather than the script's own
// `-i -v <version>` install step -- that combination additionally enables
// a "trixie-pgdg-snapshot" suite and pins an APT::Default-Release that
// isn't valid on Debian trixie's PGDG setup as of this writing (Debian 13
// is new enough that this is a rough edge in PGDG's own tooling, not a
// mistake in these flags: confirmed by hitting the exact failure against
// production and reading the script's own source). Splitting repo-setup
// from install sidesteps that entirely -- once the plain trixie-pgdg
// suite is registered, `apt-get install` resolves the right package on
// its own with no special pinning needed.
//
// Never passes -p (purge existing packages) -- the existing older client
// is left in place, untouched; this only ever adds one new apt source
// file and installs new packages. Runs once per container lifetime (the
// versioned binary check below short-circuits every call after the
// first), not on every backup.
async function ensureCompatiblePgDump() {
  const { rows } = await pool.query("SHOW server_version_num");
  const serverMajor = Math.floor(Number(rows[0].server_version_num) / 10000);
  const versionedPgDump = `/usr/lib/postgresql/${serverMajor}/bin/pg_dump`;

  try {
    await stat(versionedPgDump);
    return versionedPgDump; // already bootstrapped this container
  } catch {
    // not present yet -- fall through to install it
  }

  console.log(`No pg_dump for server major version ${serverMajor} found -- bootstrapping via PGDG...`);
  await execFileAsync("bash", ["-c", "apt-get update -qq"]);
  await execFileAsync("bash", ["-c", "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-common"]);
  // -y only (no -i/-v): just registers the repo, doesn't attempt the install itself.
  await execFileAsync("bash", ["-c", "/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y"]);
  await execFileAsync("bash", ["-c", "apt-get update -qq"]);
  await execFileAsync("bash", [
    "-c",
    `DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-client-${serverMajor}`,
  ]);

  await stat(versionedPgDump); // throws (and fails the backup run) if the bootstrap didn't actually produce it
  return versionedPgDump;
}

// Runs one full backup: pg_dump -> gzip -> upload to R2 -> prune anything
// beyond the most recent RETAIN_COUNT -> record the outcome in
// backup_runs. Every failure path still records a 'failed' row (never lets
// an error vanish silently) and always cleans up its temp files, even when
// the backup itself fails partway through.
export async function runDatabaseBackup() {
  const { rows } = await pool.query("INSERT INTO backup_runs (status) VALUES ('running') RETURNING id");
  const runId = rows[0].id;

  const dateLabel = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const dumpPath = path.join(os.tmpdir(), `xean-backup-${runId}.sql`);
  const gzPath = `${dumpPath}.gz`;
  const fileKey = `${BACKUP_PREFIX}xean-${dateLabel}.sql.gz`;

  try {
    const pgDumpBin = await ensureCompatiblePgDump();

    // --clean --if-exists: the dump includes DROP statements before each
    // CREATE, so it restores cleanly onto either an empty database or one
    // that already has data -- the safer default for a file whose whole
    // purpose is "restore this somewhere, possibly not a pristine DB."
    // --no-owner --no-privileges: the restore target's DB role may not
    // match production's exactly (e.g. a local scratch DB during a
    // restore test); omitting ownership/grant statements avoids restore
    // failures over a role that doesn't exist there.
    await execFileAsync(pgDumpBin, [
      process.env.DATABASE_URL,
      "--no-owner",
      "--no-privileges",
      "--clean",
      "--if-exists",
      "-f",
      dumpPath,
    ]);

    await pipeline(createReadStream(dumpPath), createGzip(), createWriteStream(gzPath));
    const { size: fileSizeBytes } = await stat(gzPath);

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: fileKey,
        Body: createReadStream(gzPath),
        ContentLength: fileSizeBytes,
      })
    );

    await pool.query(
      "UPDATE backup_runs SET status = 'success', finished_at = now(), file_key = $1, file_size_bytes = $2 WHERE id = $3",
      [fileKey, fileSizeBytes, runId]
    );

    await pruneOldBackups();
  } catch (err) {
    console.error("Database backup failed:", err);
    await pool.query(
      "UPDATE backup_runs SET status = 'failed', finished_at = now(), error_message = $1 WHERE id = $2",
      [String(err.message || err).slice(0, 2000), runId]
    );
  } finally {
    // Best-effort cleanup -- a leftover temp file from a failed run
    // shouldn't also crash the cleanup step itself.
    await unlink(dumpPath).catch(() => {});
    await unlink(gzPath).catch(() => {});
  }
}

// Keeps only the RETAIN_COUNT most recent backup objects in R2, deleting
// anything older -- called after every successful backup rather than on
// its own schedule, so retention never drifts out of sync with what's
// actually been uploaded.
async function pruneOldBackups() {
  const { Contents } = await s3.send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: BACKUP_PREFIX })
  );
  if (!Contents || Contents.length <= RETAIN_COUNT) return;

  const sorted = [...Contents].sort((a, b) => b.LastModified - a.LastModified);
  const toDelete = sorted.slice(RETAIN_COUNT);
  for (const obj of toDelete) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: obj.Key }));
  }
}
