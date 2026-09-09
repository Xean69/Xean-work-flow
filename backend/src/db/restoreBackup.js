// Downloads and decompresses a database backup from R2 — it deliberately
// does NOT run the actual restore itself. Restoring overwrites whatever
// database you point it at (that's what --clean --if-exists in the backup
// means), so the last, truly destructive step stays a manual, explicit
// command the operator runs against whichever DATABASE_URL they actually
// intend (a local scratch DB while testing this, or production during a
// real incident) — never something this script could accidentally fire
// against the wrong target on its own.
//
// Usage:
//   node src/db/restoreBackup.js latest
//   node src/db/restoreBackup.js 2026-09-07
//
// See BACKUPS.md for the full restore procedure and why --clean --if-exists
// makes this safe to run against a non-empty database too.
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";

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

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: node src/db/restoreBackup.js <latest|YYYY-MM-DD>");
    process.exit(1);
  }

  const { Contents } = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: BACKUP_PREFIX }));
  if (!Contents || Contents.length === 0) {
    console.error("No backups found in R2.");
    process.exit(1);
  }

  let key;
  if (arg === "latest") {
    key = [...Contents].sort((a, b) => b.LastModified - a.LastModified)[0].Key;
  } else {
    key = `${BACKUP_PREFIX}xean-${arg}.sql.gz`;
    if (!Contents.some((obj) => obj.Key === key)) {
      console.error(`No backup found for ${arg}. Available: ${Contents.map((o) => o.Key).join(", ")}`);
      process.exit(1);
    }
  }

  console.log(`Downloading ${key}...`);
  const { Body } = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const gzBuffer = await streamToBuffer(Body);
  const sqlBuffer = gunzipSync(gzBuffer);

  const outPath = path.resolve(process.cwd(), `restored-${path.basename(key, ".gz")}`);
  await writeFile(outPath, sqlBuffer);

  console.log(`\nDecompressed to: ${outPath}`);
  console.log(`\nTo restore, run this against whichever database you intend (this OVERWRITES existing data there):`);
  console.log(`\n  psql "<TARGET_DATABASE_URL>" < "${outPath}"\n`);
  console.log("Never run this against production's DATABASE_URL unless this is an actual disaster-recovery restore.");
}

main().catch((err) => {
  console.error("Restore download failed:", err);
  process.exit(1);
});
